import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { eq } from "drizzle-orm";
import { createApp } from "../server/app.js";
import { getDb } from "../server/db.js";
import { device, event, household, letter } from "../server/schema.js";
import { newToken } from "../server/tokens.js";

const TEST_EMAIL = "test-docket@biscuit.local";

describe.skipIf(!process.env.DATABASE_URL)("docket, letters, handoff, events", () => {
  const app = createApp();
  let token = "";
  let householdId = "";
  const req = (path: string, init: RequestInit = {}) => app.request(path, { ...init, headers: { authorization: `Bearer ${token}`, "content-type": "application/json", ...(init.headers as any) } });

  beforeAll(async () => {
    const db = getDb();
    await db.delete(household).where(eq(household.ownerEmail, TEST_EMAIL));
    const [h] = await db.insert(household).values({ ownerEmail: TEST_EMAIL, seniorName: "Rosa Test", called: "Rosa" }).returning();
    householdId = h.id;
    const t = newToken();
    token = t.token;
    await db.insert(device).values({ householdId, kind: "rosa", tokenHash: t.hash, label: "Rosa's phone" });
  });
  afterAll(async () => { await getDb().delete(household).where(eq(household.ownerEmail, TEST_EMAIL)); });

  test("a letter summary is stored and listed, newest first", async () => {
    const id = crypto.randomUUID();
    const res = await req("/api/biscuit/letter", { method: "POST", body: JSON.stringify({ id, readAt: "2026-10-26T15:49:00Z", kind: "bill", sender: "Massachusetts General Hospital", hospitalCcn: "220071", amountCents: 185000, statementOn: "2026-10-03", dueOn: "2026-11-02", quotes: [{ field: "amount_due", quote: "Amount Due: $1,850.00" }] }) });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ id, stored: true });
    const docket = await (await req("/api/biscuit/docket")).json();
    expect(docket.letters[0]).toMatchObject({ id, kind: "bill", sender: "Massachusetts General Hospital", status: "read", amountCents: 185000 });
    expect(docket.lastMailSeen).toBeNull();
  });

  test("handoff records the event, marks the letter and returns the Waive link", async () => {
    const [row] = await getDb().select().from(letter).where(eq(letter.householdId, householdId));
    const res = await req("/api/biscuit/handoff", { method: "POST", body: JSON.stringify({ letterId: row.id, ccn: "220071" }) });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ waiveUrl: "https://waive.kindred-ai.dev/start?ccn=220071" });
    const events = await getDb().select().from(event).where(eq(event.householdId, householdId));
    expect(events.map((e) => e.kind)).toContain("handoff");
    const docket = await (await req("/api/biscuit/docket")).json();
    expect(docket.letters[0].status).toBe("handoff");
    expect(docket.waiting[0].id).toBe(row.id);
  });

  test("a tossed letter and a hidden letter", async () => {
    const [row] = await getDb().select().from(letter).where(eq(letter.householdId, householdId));
    expect((await req(`/api/biscuit/letter/${row.id}`, { method: "PATCH", body: JSON.stringify({ status: "tossed" }) })).status).toBe(200);
    expect((await (await req("/api/biscuit/docket")).json()).letters[0].status).toBe("tossed");
    expect((await req(`/api/biscuit/letter/${row.id}`, { method: "PATCH", body: JSON.stringify({ hidden: true }) })).status).toBe(200);
    expect((await (await req("/api/biscuit/docket")).json()).letters).toHaveLength(0);
  });

  test("docket returns the last mail_seen with no push subscription on file", async () => {
    const res = await req("/api/biscuit/events", { method: "POST", body: JSON.stringify({ kind: "mail_seen", data: { source: "test" } }) });
    expect(res.status).toBe(200);
    const docket = await (await req("/api/biscuit/docket")).json();
    expect(typeof docket.lastMailSeen).toBe("string");
    expect((await req("/api/biscuit/events", { method: "POST", body: JSON.stringify({ kind: "nope" }) })).status).toBe(400);
  });
});
