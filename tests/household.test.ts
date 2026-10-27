import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { eq, sql } from "drizzle-orm";
import { createApp } from "../server/app.js";
import { getDb } from "../server/db.js";
import { deleteCount, device, household, letter } from "../server/schema.js";
import { newToken } from "../server/tokens.js";

const EMAIL = "delete-test@biscuit.local";

describe.skipIf(!process.env.DATABASE_URL)("DELETE /household", () => {
  const app = createApp();
  let token = "";
  let householdId = "";
  beforeAll(async () => {
    const db = getDb();
    await db.delete(household).where(eq(household.ownerEmail, EMAIL));
    const [h] = await db.insert(household).values({ ownerEmail: EMAIL, seniorName: "Rosa", called: "Rosa" }).returning();
    householdId = h.id;
    const t = newToken(); token = t.token;
    await db.insert(device).values({ householdId, kind: "rosa", tokenHash: t.hash });
    await db.insert(letter).values({ id: crypto.randomUUID(), householdId, readAt: new Date(), kind: "bill", sender: "X" });
  });
  afterAll(async () => { await getDb().delete(household).where(eq(household.ownerEmail, EMAIL)); });

  test("removes everything and counts once", async () => {
    const day = new Date().toISOString().slice(0, 10);
    const [before] = await getDb().select().from(deleteCount).where(eq(deleteCount.day, day));
    const res = await app.request("/api/biscuit/household", { method: "DELETE", headers: { authorization: `Bearer ${token}` } });
    expect(res.status).toBe(200);
    expect(await getDb().select().from(household).where(eq(household.id, householdId))).toHaveLength(0);
    expect(await getDb().select().from(letter).where(eq(letter.householdId, householdId))).toHaveLength(0);
    expect(await getDb().select().from(device).where(eq(device.householdId, householdId))).toHaveLength(0);
    const [after] = await getDb().select().from(deleteCount).where(eq(deleteCount.day, day));
    expect(after.count).toBe((before?.count ?? 0) + 1);
    expect((await app.request("/api/biscuit/docket", { headers: { authorization: `Bearer ${token}` } })).status).toBe(401);
    void sql;
  });
});
