import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { eq } from "drizzle-orm";
import { createApp } from "../server/app.js";
import { getDb } from "../server/db.js";
import { cameraStatus, caretakerName } from "../server/routes/ana.js";
import { cam, device, event, household, letter } from "../server/schema.js";

test("caretakerName: the account's first name, else the email's first word", () => {
  expect(caretakerName({ name: "Ana Alvarez", email: "x@y.z" })).toBe("Ana");
  expect(caretakerName({ email: "ana.alvarez@gmail.com" })).toBe("Ana");
  expect(caretakerName({ email: "" })).toBe("there");
});

test("cameraStatus", () => {
  const now = new Date("2026-10-27T12:00:00Z");
  expect(cameraStatus(null, null, now)).toBe("not_set");
  expect(cameraStatus({ paused: false }, new Date(now.getTime() - 179_000), now)).toBe("online");
  expect(cameraStatus({ paused: false }, new Date(now.getTime() - 181_000), now)).toBe("offline");
  expect(cameraStatus({ paused: true }, now, now)).toBe("paused");
  // The phone keeps its heartbeat while its camera has frozen: asleep, not online; a dead heartbeat still means offline.
  expect(cameraStatus({ paused: false, frozenAt: now }, now, now)).toBe("asleep");
  expect(cameraStatus({ paused: false, frozenAt: now }, new Date(now.getTime() - 181_000), now)).toBe("offline");
  expect(cameraStatus({ paused: true, frozenAt: now }, now, now)).toBe("paused");
  expect(cameraStatus({ paused: false, frozenAt: null }, now, now)).toBe("online");
});

const EMAIL = "family-test@biscuit.local";

describe.skipIf(!process.env.DATABASE_URL)("pause and resume the mailbox phone", () => {
  const app = createApp({ anaEnv: { KINDRED_AUTH_BYPASS: EMAIL } });
  const req = (path: string, init: RequestInit = {}) => app.request(path, { ...init, headers: { "content-type": "application/json", ...(init.headers as any) } });
  beforeAll(async () => {
    const db = getDb();
    await db.delete(household).where(eq(household.ownerEmail, EMAIL));
    const [h] = await db.insert(household).values({ ownerEmail: EMAIL, seniorName: "Rosa", called: "Rosa" }).returning();
    await db.insert(cam).values({ householdId: h.id, region: { x: 0.1, y: 0.1, w: 0.3, h: 0.2 }, setAt: new Date() });
  });
  afterAll(async () => { await getDb().delete(household).where(eq(household.ownerEmail, EMAIL)); });

  test("the page says whether this is the founder's household (the admin view opens for it) and how many SAM calls the phone made today", async () => {
    const fam = await (await req("/api/biscuit/family")).json();
    expect(fam.household.admin).toBe(false);
    expect(fam.camera).toMatchObject({ samCallsToday: 0 });
    const admin = createApp({ anaEnv: { KINDRED_AUTH_BYPASS: EMAIL, CAM_COLLECT_OWNER: EMAIL.toUpperCase() } });
    const mine = await (await admin.request("/api/biscuit/family", { headers: { "content-type": "application/json" } })).json();
    expect(mine.household.admin).toBe(true);
  });

  test("pause marks it paused, resume brings it back to offline until a heartbeat", async () => {
    expect((await req("/api/biscuit/cam/pause", { method: "POST" })).status).toBe(200);
    expect((await (await req("/api/biscuit/family")).json()).camera.status).toBe("paused");
    expect((await req("/api/biscuit/cam/resume", { method: "POST" })).status).toBe(200);
    const fam = await (await req("/api/biscuit/family")).json();
    expect(fam.camera.status).toBe("offline");
  });
});

describe.skipIf(!process.env.DATABASE_URL)("a re-linked mailbox phone", () => {
  const EMAIL2 = "family-relink-test@biscuit.local";
  const app = createApp({ anaEnv: { KINDRED_AUTH_BYPASS: EMAIL2 } });
  beforeAll(async () => {
    const db = getDb();
    await db.delete(household).where(eq(household.ownerEmail, EMAIL2));
    const [h] = await db.insert(household).values({ ownerEmail: EMAIL2, seniorName: "Rosa", called: "Rosa" }).returning();
    await db.insert(cam).values({ householdId: h.id, region: { x: 0.1, y: 0.1, w: 0.3, h: 0.2 }, setAt: new Date() });
    // The first phone linked this morning and fell silent; the second was linked later and is alive now.
    await db.insert(device).values({ householdId: h.id, kind: "cam", label: "Mailbox phone", lastSeenAt: new Date(Date.now() - 2 * 3600_000), battery: 40, charging: false });
    await db.insert(device).values({ householdId: h.id, kind: "cam", label: "Mailbox phone", lastSeenAt: new Date(), battery: 90, charging: true });
  });
  afterAll(async () => { await getDb().delete(household).where(eq(household.ownerEmail, EMAIL2)); });

  test("the status and battery come from the phone seen last, not the first row", async () => {
    const fam = await (await app.request("/api/biscuit/family", { headers: { "content-type": "application/json" } })).json();
    expect(fam.camera.status).toBe("online");
    expect(fam.camera.battery).toBe(90);
    expect(fam.camera.charging).toBe(true);
  });

  test("every movement the phone sent shows on Ana's page: in Recent and as today's count", async () => {
    const [h] = await getDb().select({ id: household.id }).from(household).where(eq(household.ownerEmail, EMAIL2));
    await getDb().insert(event).values([
      { householdId: h.id, kind: "cam_motion", data: { seen: null, level: 17.5 } },
      { householdId: h.id, kind: "cam_motion", data: { seen: "mail truck", level: 31 }, at: new Date(Date.now() - 3 * 24 * 3600_000) },
    ]);
    const fam = await (await app.request("/api/biscuit/family", { headers: { "content-type": "application/json" } })).json();
    expect(fam.events.filter((e: any) => e.kind === "cam_motion")).toHaveLength(2);
    expect(fam.events.find((e: any) => e.kind === "cam_motion" && e.data.seen === null).data.level).toBe(17.5);
    expect(fam.camera.movementsToday).toBe(1);
  });
});

// Ana passes a letter to a Kindred product; the page shows where it went, and the fields Rosa corrected ride with each letter.
describe.skipIf(!process.env.DATABASE_URL)("passing a letter on, and Rosa's corrections on Ana's page", () => {
  const EMAIL2 = "family-pass-test@biscuit.local";
  const app = createApp({ anaEnv: { KINDRED_AUTH_BYPASS: EMAIL2 } });
  const req = (path: string, init: RequestInit = {}) => app.request(path, { ...init, headers: { "content-type": "application/json", ...(init.headers as any) } });
  let householdId = "";
  beforeAll(async () => {
    const db = getDb();
    await db.delete(household).where(eq(household.ownerEmail, EMAIL2));
    const [h] = await db.insert(household).values({ ownerEmail: EMAIL2, seniorName: "Rosa", called: "Rosa" }).returning();
    householdId = h.id;
    await db.insert(letter).values({ id: "11111111-1111-4111-8111-111111111111", householdId, readAt: new Date(), kind: "bill", sender: "Mass General", amountCents: 123450, dueOn: "2026-11-20", quotes: [], answers: {}, status: "read" });
    await db.insert(event).values({ householdId, kind: "letter_edited", data: { letterId: "11111111-1111-4111-8111-111111111111", fields: ["amountCents"] } });
  });
  afterAll(async () => { await getDb().delete(household).where(eq(household.ownerEmail, EMAIL2)); });

  test("pass records where the letter went; the family page shows it and the corrected fields", async () => {
    expect((await req("/api/biscuit/family/letter/11111111-1111-4111-8111-111111111111/pass", { method: "POST", body: JSON.stringify({ to: "nowhere" }) })).status).toBe(400);
    expect((await req("/api/biscuit/family/letter/11111111-1111-4111-8111-111111111111/pass", { method: "POST", body: JSON.stringify({ to: "lull" }) })).status).toBe(200);
    expect((await req("/api/biscuit/family/letter/22222222-2222-4222-8222-222222222222/pass", { method: "POST", body: JSON.stringify({ to: "waive" }) })).status).toBe(404);
    const fam = await (await req("/api/biscuit/family")).json();
    const l = fam.letters.find((x: any) => x.id === "11111111-1111-4111-8111-111111111111");
    expect(l.edited).toEqual(["amountCents"]);
    expect(l.passed.map((p: any) => p.to)).toEqual(["lull"]);
    expect(fam.events.some((e: any) => e.kind === "passed")).toBe(true);
    expect(fam.events.some((e: any) => e.kind === "letter_edited")).toBe(false);
  });
});
