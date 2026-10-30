import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { and, eq } from "drizzle-orm";
import { createApp } from "../server/app.js";
import { getDb } from "../server/db.js";
import { localParts } from "../server/chime.js";
import { device, event, household, memory, reminder } from "../server/schema.js";
import { newToken } from "../server/tokens.js";

// The companion route: the phone sends the last turns; the server adds what it knows, asks the model (a fake here), applies what
// Rosa agreed to remember, the reminder she set, the place she named and the words for Ana, and returns the reply and the job.
const EMAIL = "companion-test@biscuit.local";
const TZ = "America/New_York";

describe.skipIf(!process.env.DATABASE_URL)("the companion, memories and reminders", () => {
  const seen: any[] = [];
  const sent: string[] = [];
  const fakeConverse = (async (input: any) => {
    seen.push(input);
    const last = input.messages[input.messages.length - 1]?.content ?? "";
    if (/forget/.test(last)) return { reply: "Forgotten.", action: "none", tellAna: null, remember: [], forget: ["oatmeal"], reminder: null, place: null };
    if (/oatmeal/.test(last)) return { reply: "Oatmeal with raisins, noted!", action: "none", tellAna: null, remember: [{ topic: "food", fact: "likes oatmeal with raisins" }], forget: [], reminder: null, place: null };
    if (/pills/.test(last)) return { reply: "I'll chime at eight for your pills.", action: "none", tellAna: null, remember: [], forget: [], reminder: { label: "pills", minutes: localParts(new Date(), TZ).minutes }, place: null };
    if (/Boston/.test(last)) return { reply: "Boston it is.", action: "none", tellAna: null, remember: [{ topic: "home", fact: "lives in Boston" }], forget: [], reminder: null, place: "Boston" };
    if (/tell Ana/.test(last)) return { reply: "I told Ana.", action: "tell_ana", tellAna: "I'm fine today", remember: [], forget: [], reminder: null, place: null };
    return { reply: "Hello, Rosa!", action: "none", tellAna: null, remember: [], forget: [], reminder: null, place: null };
  }) as any;
  const geocoder = async (name: string) => (name === "Boston" ? { label: "Boston, Massachusetts", lat: 42.3584, lon: -71.0598 } : null);
  const weather = async (lat: number) => (lat === 42.3584 ? "Mostly sunny, 58 now, high 64, low 47, rain unlikely." : null);
  const app = createApp({ anaEnv: { KINDRED_AUTH_BYPASS: EMAIL }, chimeEnv: { CRON_SECRET: "s" }, companion: fakeConverse, geocoder, weather, pushSend: async (sub: any) => { sent.push(sub.endpoint); } });
  let householdId = "", token = "";
  const req = (path: string, init: RequestInit = {}) => app.request(path, { ...init, headers: { authorization: `Bearer ${token}`, "content-type": "application/json", ...(init.headers as any) } });
  const say = (content: string, history: any[] = []) => req("/api/biscuit/companion", { method: "POST", body: JSON.stringify({ messages: [...history, { role: "user", content }], nowLocal: "Thursday 3:40 PM" }) });

  beforeAll(async () => {
    const db = getDb();
    await db.delete(household).where(eq(household.ownerEmail, EMAIL));
    const [h] = await db.insert(household).values({ ownerEmail: EMAIL, seniorName: "Rosa", called: "Rosa", tz: TZ }).returning();
    householdId = h.id;
    const t = newToken(); token = t.token;
    await db.insert(device).values({ householdId, kind: "rosa", tokenHash: t.hash, pushSubscription: { endpoint: "https://push.example/rosa", keys: { p256dh: "x", auth: "y" } } });
  });
  afterAll(async () => { await getDb().delete(household).where(eq(household.ownerEmail, EMAIL)); });

  test("a turn answers, remembers what she said, and the next turn's prompt knows it", async () => {
    const r1 = await (await say("I had oatmeal with raisins today")).json();
    expect(r1).toMatchObject({ reply: "Oatmeal with raisins, noted!", action: "none", remembered: ["likes oatmeal with raisins"] });
    const rows = await getDb().select().from(memory).where(eq(memory.householdId, householdId));
    expect(rows.map((m) => [m.topic, m.fact])).toEqual([["food", "likes oatmeal with raisins"]]);
    await say("hello");
    expect(seen[seen.length - 1].context.memories).toEqual([{ topic: "food", fact: "likes oatmeal with raisins" }]);
    expect(seen[seen.length - 1].context.called).toBe("Rosa");
    expect(seen[seen.length - 1].context.nowLocal).toBe("Thursday 3:40 PM");
    const list = await (await req("/api/biscuit/memories")).json();
    expect(list.memories[0]).toMatchObject({ topic: "food", fact: "likes oatmeal with raisins" });
    expect((await req(`/api/biscuit/memories/${list.memories[0].id}`, { method: "DELETE" })).status).toBe(200);
    expect((await (await req("/api/biscuit/memories")).json()).memories).toEqual([]);
  });

  test("forget removes the matching memory; a place is geocoded and the weather reaches the prompt", async () => {
    await say("I had oatmeal with raisins today");
    await say("please forget the oatmeal thing");
    expect(await getDb().select().from(memory).where(eq(memory.householdId, householdId))).toEqual([]);
    const r = await (await say("I live in Boston")).json();
    expect(r.reply).toBe("Boston it is.");
    const [h] = await getDb().select().from(household).where(eq(household.id, householdId));
    expect(h.place).toBe("Boston, Massachusetts");
    expect(h.lat).toBeCloseTo(42.3584);
    await say("hello");
    expect(seen[seen.length - 1].context.weather).toBe("Mostly sunny, 58 now, high 64, low 47, rain unlikely.");
  });

  test("tell Ana records her words for Ana's page", async () => {
    const r = await (await say("tell Ana I'm fine today")).json();
    expect(r.action).toBe("tell_ana");
    const rows = await getDb().select().from(event).where(and(eq(event.householdId, householdId), eq(event.kind, "rosa_said")));
    expect(rows.map((e) => (e.data as any).text)).toContain("I'm fine today");
  });

  test("a reminder she sets chimes on the tick once a day, and she can see and delete it", async () => {
    await say("remind me about my pills");
    const [row] = await getDb().select().from(reminder).where(eq(reminder.householdId, householdId));
    expect(row).toMatchObject({ label: "pills", minutes: localParts(new Date(), TZ).minutes, lastFiredAt: null });
    const tick = () => app.request("/api/biscuit/chime/tick", { method: "POST", headers: { authorization: "Bearer s" } });
    const t1 = await (await tick()).json();
    expect(t1.remindersSent).toBeGreaterThanOrEqual(1);
    expect(sent).toContain("https://push.example/rosa");
    const due = await getDb().select().from(event).where(and(eq(event.householdId, householdId), eq(event.kind, "reminder_due")));
    expect(due).toHaveLength(1);
    expect((await getDb().select().from(reminder).where(eq(reminder.id, row.id)))[0].lastFiredAt).toBeInstanceOf(Date);
    await tick();
    expect(await getDb().select().from(event).where(and(eq(event.householdId, householdId), eq(event.kind, "reminder_due")))).toHaveLength(1);
    const list = await (await req("/api/biscuit/reminders")).json();
    expect(list.reminders[0]).toMatchObject({ id: row.id, label: "pills", time: expect.any(String) });
    expect((await req(`/api/biscuit/reminders/${row.id}`, { method: "DELETE" })).status).toBe(200);
    expect((await (await req("/api/biscuit/reminders")).json()).reminders).toEqual([]);
  });
});
