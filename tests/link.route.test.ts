import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { eq } from "drizzle-orm";
import { createApp } from "../server/app.js";
import { getDb } from "../server/db.js";
import { device, household, linkCode } from "../server/schema.js";

const TEST_EMAIL = "test-link@biscuit.local";

describe.skipIf(!process.env.DATABASE_URL)("POST /api/biscuit/link/claim", () => {
  // The live claim limiter is shared production state (10 per caller per 10 minutes); it has its own test below.
  const app = createApp({ claimLimiter: async () => true });
  let householdId = "";
  beforeAll(async () => {
    const db = getDb();
    await db.delete(household).where(eq(household.ownerEmail, TEST_EMAIL));
    const [h] = await db.insert(household).values({ ownerEmail: TEST_EMAIL, seniorName: "Rosa Test", called: "Rosa" }).returning();
    householdId = h.id;
    const soon = new Date(Date.now() + 600_000);
    await db.insert(linkCode).values([
      { code: "900001", householdId, kind: "rosa", expiresAt: soon },
      { code: "900002", householdId, kind: "cam", expiresAt: new Date(Date.now() - 1000) },
    ]);
  });
  afterAll(async () => {
    await getDb().delete(household).where(eq(household.ownerEmail, TEST_EMAIL));
  });
  const claim = (code: string) => app.request("/api/biscuit/link/claim", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ code }) });

  test("a good code mints a device token once", async () => {
    const res = await claim("900001");
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.deviceToken).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(body.household).toEqual({ called: "Rosa", language: "en" });
    expect(body.kind).toBe("rosa");
    const devices = await getDb().select().from(device).where(eq(device.householdId, householdId));
    expect(devices).toHaveLength(1);
    expect(devices[0].label).toBe("Rosa's phone");
    const again = await claim("900001");
    expect(again.status).toBe(410);
    expect(await again.json()).toEqual({ error: "used" });
  });

  test("an expired code is 410 and an unknown code is 404", async () => {
    expect((await claim("900002")).status).toBe(410);
    const res = await claim("000000");
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: "no_match" });
  });
});

test("claims are rate limited by caller", async () => {
  const app = createApp({ claimLimiter: async () => false });
  const res = await app.request("/api/biscuit/link/claim", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ code: "123456" }) });
  expect(res.status).toBe(429);
});
