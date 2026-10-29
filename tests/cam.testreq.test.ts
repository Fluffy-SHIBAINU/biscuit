import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { eq } from "drizzle-orm";
import { createApp } from "../server/app.js";
import { getDb } from "../server/db.js";
import { cam, device, event, household } from "../server/schema.js";
import { newToken } from "../server/tokens.js";

// The envelope test is optional and runs where the camera is. Ana can ask for it from her page: the mailbox phone
// learns it at its next heartbeat, runs the test, and its result clears the request. Nothing waits on the result.
const EMAIL = "testreq-test@biscuit.local";

describe.skipIf(!process.env.DATABASE_URL)("Ana asks the mailbox phone to run the envelope test", () => {
  const app = createApp({ anaEnv: { KINDRED_AUTH_BYPASS: EMAIL }, pushSend: async () => {} });
  let householdId = "", token = "";
  const ana = (path: string, method = "GET", body?: unknown) => app.request(path, { method, headers: { "content-type": "application/json" }, ...(body ? { body: JSON.stringify(body) } : {}) });
  const phone = (path: string, body: unknown) => app.request(path, { method: "POST", headers: { authorization: `Bearer ${token}`, "content-type": "application/json" }, body: JSON.stringify(body) });
  const heartbeat = async () => (await phone("/api/biscuit/cam/heartbeat", { battery: 80, charging: true })).json();
  beforeAll(async () => {
    const db = getDb();
    await db.delete(household).where(eq(household.ownerEmail, EMAIL));
    const [h] = await db.insert(household).values({ ownerEmail: EMAIL, seniorName: "Rosa", called: "Rosa" }).returning();
    householdId = h.id;
    const t = newToken(); token = t.token;
    await db.insert(device).values({ householdId, kind: "cam", tokenHash: t.hash, label: "sill" });
  });
  afterAll(async () => { await getDb().delete(household).where(eq(household.ownerEmail, EMAIL)); });

  test("with no camera set up the request is refused", async () => {
    expect((await ana("/api/biscuit/cam/test/request", "POST")).status).toBe(404);
  });

  test("the request reaches the phone's next heartbeat and stays until the test's result clears it", async () => {
    await getDb().insert(cam).values({ householdId, region: { x: 0.1, y: 0.1, w: 0.3, h: 0.2 }, setAt: new Date(), testStatus: "works" });
    expect((await heartbeat()).testRequested).toBe(false);
    expect(await (await ana("/api/biscuit/cam/test/request", "POST")).json()).toEqual({ ok: true });
    expect((await heartbeat()).testRequested).toBe(true);
    expect((await heartbeat()).testRequested).toBe(true);
    expect((await phone("/api/biscuit/cam/test", { result: "pending" })).status).toBe(200);
    expect((await heartbeat()).testRequested).toBe(false);
    const fam = await (await ana("/api/biscuit/family")).json();
    expect(fam.camera.testStatus).toBe("pending");
    expect(fam.events.find((e: any) => e.kind === "cam_test_run")?.data).toEqual({ result: "pending" });
  });

  test("a request older than ten minutes is not carried to the phone", async () => {
    await getDb().insert(event).values({ householdId, kind: "cam_test_requested", at: new Date(Date.now() - 11 * 60_000), data: {} });
    expect((await heartbeat()).testRequested).toBe(false);
  });
});
