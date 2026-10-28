import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { and, eq } from "drizzle-orm";
import { createApp } from "../server/app.js";
import { getDb } from "../server/db.js";
import { device, event, household, letter } from "../server/schema.js";
import { newToken } from "../server/tokens.js";

const EMAIL = "second-reader-test@biscuit.local";

describe.skipIf(!process.env.DATABASE_URL)("what Ana's page keeps from a read twice", () => {
  const pushes: string[] = [];
  const app = createApp({ anaEnv: { KINDRED_AUTH_BYPASS: EMAIL }, pushSend: async (_s, body) => { pushes.push(body); } });
  let token = "";
  let householdId = "";
  const rosa = (path: string, init: RequestInit = {}) => app.request(path, { ...init, headers: { authorization: `Bearer ${token}`, "content-type": "application/json", ...(init.headers as any) } });
  const ana = (path: string, init: RequestInit = {}) => app.request(path, { ...init, headers: { "content-type": "application/json", ...(init.headers as any) } });
  const checks = [{ field: "statement_date", quotes: [{ reader: "meta", value: "10/03/2026", quote: "10/03/2026" }, { reader: "fireworks", value: "10/08/2026", quote: "Statement Date: 10/08/2026" }] }];

  beforeAll(async () => {
    const db = getDb();
    await db.delete(household).where(eq(household.ownerEmail, EMAIL));
    const [h] = await db.insert(household).values({ ownerEmail: EMAIL, seniorName: "Rosa", called: "Rosa" }).returning();
    householdId = h.id;
    const t = newToken();
    token = t.token;
    await db.insert(device).values({ householdId, kind: "rosa", tokenHash: t.hash, pushSubscription: { endpoint: "https://push.example/rosa", keys: {} } });
    const [readRow] = await db.insert(event).values({ householdId, deviceId: null, kind: "letter_read", data: { kind: "bill", readBy: "twice", readers: [{ name: "meta", status: "ok", ms: 5700 }, { name: "fireworks", status: "ok", ms: 4100 }], agreed: 4, differ: 1 } }).returning({ id: event.id });
    await db.insert(event).values({ householdId, deviceId: null, kind: "shadow_read", data: { letterEventId: readRow.id, name: "shadow", label: "Kindred's reader (Glimmer 30B, trained)", status: "ok", ms: 4300, agreed: 4, of: 5 } });
  });
  afterAll(async () => { await getDb().delete(household).where(eq(household.ownerEmail, EMAIL)); });

  test("the letter row keeps readBy and the checks; the family page lists them with the readers' last states", async () => {
    const id = crypto.randomUUID();
    const res = await rosa("/api/biscuit/letter", { method: "POST", body: JSON.stringify({ id, readAt: "2026-10-27T15:49:00Z", kind: "bill", sender: "Massachusetts General Hospital", hospitalCcn: "220071", amountCents: 185000, statementOn: null, readBy: "twice", checks, needsReview: true, quotes: [{ field: "amount_due", quote: "$1,850.00" }] }) });
    expect(res.status).toBe(200);
    const docket = await (await rosa("/api/biscuit/docket")).json();
    expect(docket.letters[0]).toMatchObject({ id, readBy: "twice", checks, lookRequestedAt: null });
    const fam = await (await ana("/api/biscuit/family")).json();
    expect(fam.letters[0]).toMatchObject({ id, readBy: "twice", checks, needsReview: true });
    expect(fam.readers).toMatchObject({ readBy: "twice", list: [{ name: "meta", status: "ok", ms: 5700 }, { name: "fireworks", status: "ok", ms: 4100 }, { name: "shadow", shadow: true, label: "Kindred's reader (Glimmer 30B, trained)", status: "ok", ms: 4300, agreed: 4, of: 5 }] });
    expect(fam.readers.list).toHaveLength(3);
    expect(typeof fam.readers.at).toBe("string");
  });

  test("readBy and checks are sanitised: unknown readBy dropped, long quotes cut, at most ten checks", async () => {
    const id = crypto.randomUUID();
    const many = Array.from({ length: 12 }, (_, i) => ({ field: `f${i}`, quotes: [{ reader: "meta", value: "x".repeat(500), quote: "y".repeat(500) }] }));
    await rosa("/api/biscuit/letter", { method: "POST", body: JSON.stringify({ id, kind: "notice", sender: "Someone", readBy: "thrice", checks: many }) });
    const [row] = await getDb().select().from(letter).where(eq(letter.id, id));
    expect(row.readBy).toBeNull();
    expect((row.checks as any[]).length).toBe(10);
    expect((row.checks as any[])[0].quotes[0].quote.length).toBe(300);
    expect((row.checks as any[])[0].quotes[0].value.length).toBe(200);
  });

  test("Ana asks for another look: the letter is marked, Rosa's phone is pushed, Recent says so; a new read from that sender clears it", async () => {
    const [row] = await getDb().select().from(letter).where(and(eq(letter.householdId, householdId), eq(letter.sender, "Massachusetts General Hospital")));
    const res = await ana(`/api/biscuit/family/letter/${row.id}/again`, { method: "POST" });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, sent: 1 });
    expect(JSON.parse(pushes[0])).toMatchObject({ kind: "look_requested", url: "/letter", body: "Ana would like another look at the letter from Massachusetts General Hospital. Tap to show it again." });
    const docket = await (await rosa("/api/biscuit/docket")).json();
    expect(typeof docket.letters.find((l: any) => l.id === row.id).lookRequestedAt).toBe("string");
    const fam = await (await ana("/api/biscuit/family")).json();
    expect(fam.events.some((e: any) => e.kind === "look_requested" && e.data.letterId === row.id)).toBe(true);
    expect((await ana(`/api/biscuit/family/letter/${crypto.randomUUID()}/again`, { method: "POST" })).status).toBe(404);
    await rosa("/api/biscuit/letter", { method: "POST", body: JSON.stringify({ id: crypto.randomUUID(), kind: "bill", sender: "Massachusetts General Hospital", readBy: "twice", checks: [] }) });
    const after = await (await rosa("/api/biscuit/docket")).json();
    expect(after.letters.find((l: any) => l.id === row.id).lookRequestedAt).toBeNull();
  });
});
