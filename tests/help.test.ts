import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { eq } from "drizzle-orm";
import { createApp } from "../server/app.js";
import { getDb } from "../server/db.js";
import { device, household } from "../server/schema.js";
import { newToken } from "../server/tokens.js";

const EMAIL = "help-test@biscuit.local";

describe.skipIf(!process.env.DATABASE_URL)("help test round trip", () => {
  const sent: any[] = [];
  const app = createApp({ anaEnv: { KINDRED_AUTH_BYPASS: EMAIL }, pushSend: async (_sub: any, body: string) => { sent.push(JSON.parse(body)); } });
  let token = "";
  beforeAll(async () => {
    const db = getDb();
    await db.delete(household).where(eq(household.ownerEmail, EMAIL));
    const [h] = await db.insert(household).values({ ownerEmail: EMAIL, seniorName: "Rosa", called: "Rosa" }).returning();
    const t = newToken(); token = t.token;
    await db.insert(device).values([
      { householdId: h.id, kind: "rosa", tokenHash: t.hash, label: "Rosa's phone" },
      { householdId: h.id, kind: "ana", label: "Ana's browser", pushSubscription: { endpoint: "https://push.example/ana", keys: { p256dh: "x", auth: "y" } } },
    ]);
  });
  afterAll(async () => { await getDb().delete(household).where(eq(household.ownerEmail, EMAIL)); });

  test("the test pushes to Ana, the worker acks, Rosa's phone sees acked", async () => {
    const res = await app.request("/api/biscuit/help/test", { method: "POST", headers: { authorization: `Bearer ${token}` } });
    expect(res.status).toBe(200);
    const { eventId } = await res.json();
    expect(sent.at(-1)).toMatchObject({ kind: "help_test", eventId, url: "/ana" });
    expect((await (await app.request(`/api/biscuit/help/test/${eventId}`, { headers: { authorization: `Bearer ${token}` } })).json()).acked).toBe(false);
    const ack = await app.request("/api/biscuit/push/ack", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ eventId, kind: "help_test" }) });
    expect(ack.status).toBe(200);
    expect((await (await app.request(`/api/biscuit/help/test/${eventId}`, { headers: { authorization: `Bearer ${token}` } })).json()).acked).toBe(true);
  });

  test("a real Help event pushes to Ana with the 911 line", async () => {
    const res = await app.request("/api/biscuit/events", { method: "POST", headers: { authorization: `Bearer ${token}`, "content-type": "application/json" }, body: JSON.stringify({ kind: "help" }) });
    expect(res.status).toBe(200);
    expect(sent.at(-1)).toMatchObject({ kind: "help", body: "Rosa pressed Help. Her phone is calling 911." });
  });
});
