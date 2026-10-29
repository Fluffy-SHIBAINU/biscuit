import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { eq } from "drizzle-orm";
import { createApp } from "../server/app.js";
import { getDb } from "../server/db.js";
import { cameraStatus } from "../server/routes/ana.js";
import { cam, device, household } from "../server/schema.js";

test("cameraStatus", () => {
  const now = new Date("2026-10-27T12:00:00Z");
  expect(cameraStatus(null, null, now)).toBe("not_set");
  expect(cameraStatus({ paused: false }, new Date(now.getTime() - 179_000), now)).toBe("online");
  expect(cameraStatus({ paused: false }, new Date(now.getTime() - 181_000), now)).toBe("offline");
  expect(cameraStatus({ paused: true }, now, now)).toBe("paused");
});

const EMAIL = "family-test@biscuit.local";

describe.skipIf(!process.env.DATABASE_URL)("pause and resume the mailbox phone", () => {
  const app = createApp({ anaEnv: { KINDRED_AUTH_BYPASS: EMAIL } });
  const req = (path: string, init: RequestInit = {}) => app.request(path, { ...init, headers: { "content-type": "application/json", ...(init.headers as any) } });
  beforeAll(async () => {
    const db = getDb();
    await db.delete(household).where(eq(household.ownerEmail, EMAIL));
    const [h] = await db.insert(household).values({ ownerEmail: EMAIL, seniorName: "Rosa", called: "Rosa" }).returning();
    await db.insert(cam).values({ householdId: h.id, region: { x: 0.1, y: 0.1, w: 0.3, h: 0.2 }, setAt: new Date(), testStatus: "works" });
  });
  afterAll(async () => { await getDb().delete(household).where(eq(household.ownerEmail, EMAIL)); });

  test("pause marks it paused, resume brings it back to offline until a heartbeat", async () => {
    expect((await req("/api/biscuit/cam/pause", { method: "POST" })).status).toBe(200);
    expect((await (await req("/api/biscuit/family")).json()).camera.status).toBe("paused");
    expect((await req("/api/biscuit/cam/resume", { method: "POST" })).status).toBe(200);
    const fam = await (await req("/api/biscuit/family")).json();
    expect(fam.camera.status).toBe("offline");
    expect(fam.camera.testStatus).toBe("works");
  });
});

describe.skipIf(!process.env.DATABASE_URL)("a re-linked mailbox phone", () => {
  const EMAIL2 = "family-relink-test@biscuit.local";
  const app = createApp({ anaEnv: { KINDRED_AUTH_BYPASS: EMAIL2 } });
  beforeAll(async () => {
    const db = getDb();
    await db.delete(household).where(eq(household.ownerEmail, EMAIL2));
    const [h] = await db.insert(household).values({ ownerEmail: EMAIL2, seniorName: "Rosa", called: "Rosa" }).returning();
    await db.insert(cam).values({ householdId: h.id, region: { x: 0.1, y: 0.1, w: 0.3, h: 0.2 }, setAt: new Date(), testStatus: "pending" });
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
});
