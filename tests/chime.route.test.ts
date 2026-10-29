import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { and, eq } from "drizzle-orm";
import { createApp } from "../server/app.js";
import { localParts } from "../server/chime.js";
import { getDb } from "../server/db.js";
import { device, event, household } from "../server/schema.js";

const EMAIL = "chime-test@biscuit.local";
const SECRET = "chime-test-secret";
const TZ = "America/New_York";

test("the tick is closed without the secret", async () => {
  const app = createApp({ chimeEnv: { CRON_SECRET: SECRET } });
  expect((await app.request("/api/biscuit/chime/tick", { method: "POST" })).status).toBe(401);
  expect((await app.request("/api/biscuit/chime/tick", { method: "POST", headers: { authorization: "Bearer wrong" } })).status).toBe(401);
  const unset = createApp({ chimeEnv: {} });
  expect((await unset.request("/api/biscuit/chime/tick", { method: "POST", headers: { authorization: "Bearer " } })).status).toBe(401);
});

describe.skipIf(!process.env.DATABASE_URL)("the delivery-hour chime tick", () => {
  const sent: string[] = [];
  const app = createApp({ chimeEnv: { CRON_SECRET: SECRET }, pushSend: async (sub: any) => { sent.push(sub.endpoint); } });
  const tick = (method = "POST") => app.request("/api/biscuit/chime/tick", { method, headers: { authorization: `Bearer ${SECRET}` } });
  let due = "", seenToday = "", otherHour = "";
  const dueEvents = (id: string) => getDb().select().from(event).where(and(eq(event.householdId, id), eq(event.kind, "mail_due")));

  beforeAll(async () => {
    const db = getDb();
    await db.delete(household).where(eq(household.ownerEmail, EMAIL));
    const { minutes } = localParts(new Date(), TZ);
    const rows = await db.insert(household).values([
      { ownerEmail: EMAIL, seniorName: "Rosa Due", called: "Rosa", mailMinutes: minutes, tz: TZ },
      { ownerEmail: EMAIL, seniorName: "Rosa Seen", called: "Rosa", mailMinutes: minutes, tz: TZ },
      { ownerEmail: EMAIL, seniorName: "Rosa Later", called: "Rosa", mailMinutes: (minutes + 300) % 1440, tz: TZ },
    ]).returning();
    [due, seenToday, otherHour] = rows.map((r) => r.id);
    await db.insert(device).values([
      { householdId: due, kind: "rosa", label: "Rosa's phone", pushSubscription: { endpoint: "https://push.example/due", keys: { p256dh: "x", auth: "y" } } },
      { householdId: seenToday, kind: "rosa", label: "Rosa's phone", pushSubscription: { endpoint: "https://push.example/seen", keys: { p256dh: "x", auth: "y" } } },
    ]);
    await db.insert(event).values({ householdId: seenToday, kind: "mail_seen", data: {} });
  });
  afterAll(async () => { await getDb().delete(household).where(eq(household.ownerEmail, EMAIL)); });

  test("chimes the phone whose hour has come, once, and leaves the others alone", async () => {
    const res = await tick();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.chimed).toBeGreaterThanOrEqual(1);
    expect(body.checked).toBeGreaterThanOrEqual(3);
    expect(sent).toContain("https://push.example/due");
    expect(sent).not.toContain("https://push.example/seen");
    const mine = await dueEvents(due);
    expect(mine).toHaveLength(1);
    expect(mine[0].data).toMatchObject({ sent: 1 });
    expect(await dueEvents(seenToday)).toHaveLength(0);
    expect(await dueEvents(otherHour)).toHaveLength(0);
    const before = sent.length;
    expect((await tick("GET")).status).toBe(200);
    expect(await dueEvents(due)).toHaveLength(1);
    expect(sent.filter((e) => e === "https://push.example/due")).toHaveLength(1);
    expect(sent.length).toBeGreaterThanOrEqual(before);
  });
});
