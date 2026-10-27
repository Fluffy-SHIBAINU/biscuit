import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { eq } from "drizzle-orm";
import { createApp } from "../server/app.js";
import { getDb } from "../server/db.js";
import { device, household } from "../server/schema.js";
import { newToken } from "../server/tokens.js";

const EMAIL = "consent-test@biscuit.local";

describe.skipIf(!process.env.DATABASE_URL)("consent and sharing", () => {
  const app = createApp();
  let token = "";
  let householdId = "";
  const post = (path: string, body: unknown, method = "POST") => app.request(path, { method, headers: { authorization: `Bearer ${token}`, "content-type": "application/json" }, body: JSON.stringify(body) });
  beforeAll(async () => {
    const db = getDb();
    await db.delete(household).where(eq(household.ownerEmail, EMAIL));
    const [h] = await db.insert(household).values({ ownerEmail: EMAIL, seniorName: "Rosa", called: "Rosa" }).returning();
    householdId = h.id;
    const t = newToken(); token = t.token;
    await db.insert(device).values({ householdId, kind: "rosa", tokenHash: t.hash });
  });
  afterAll(async () => { await getDb().delete(household).where(eq(household.ownerEmail, EMAIL)); });

  test("consent is recorded once", async () => {
    expect((await post("/api/biscuit/events", { kind: "consent" })).status).toBe(200);
    const [first] = await getDb().select().from(household).where(eq(household.id, householdId));
    expect(first.consentedAt).not.toBeNull();
    await new Promise((r) => setTimeout(r, 1100));
    expect((await post("/api/biscuit/events", { kind: "consent" })).status).toBe(200);
    const [second] = await getDb().select().from(household).where(eq(household.id, householdId));
    expect(second.consentedAt?.toISOString()).toBe(first.consentedAt?.toISOString());
  });

  test("the phone can turn sharing off", async () => {
    expect((await post("/api/biscuit/household", { shareLetters: false }, "PATCH")).status).toBe(200);
    const [row] = await getDb().select().from(household).where(eq(household.id, householdId));
    expect(row.shareLetters).toBe(false);
  });
});
