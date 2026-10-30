import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { and, eq } from "drizzle-orm";
import { createApp } from "../server/app.js";
import { getDb } from "../server/db.js";
import { cam, device, event, household } from "../server/schema.js";
import { newToken } from "../server/tokens.js";

// The watched box, found by SAM or drawn by hand: the route stores the box exactly as sent and which of the two set it,
// and every new box sends the envelope test back to pending.
const linked = async () => ({ device: { id: "d1", householdId: "h1", kind: "cam" } as any, household: { id: "h1", called: "Rosa", language: "en" } as any });
const post = (app: any, body: unknown) => app.request("/api/biscuit/cam/region", { method: "POST", body: JSON.stringify(body), headers: { authorization: "Bearer x", "content-type": "application/json" } });

test("cam/region refuses a bad box and a source that is neither sam nor hand, before the database", async () => {
  const app = createApp({ lookup: linked });
  const bad = await post(app, { region: { x: 0.2, y: 0.2, w: 0.4, h: 0.4 }, source: "guess" });
  expect(bad.status).toBe(400);
  expect(await bad.json()).toEqual({ error: "bad_source" });
  expect((await post(app, { region: { x: 0.2, y: 0.2, w: 0.4, h: 0.4 }, source: 3 })).status).toBe(400);
  expect((await post(app, { region: { x: 0.9, y: 0.2, w: 0.4, h: 0.4 }, source: "hand" })).status).toBe(400);
  expect((await post(app, { region: { x: 0.2, y: 0.2, w: 0, h: 0.4 }, source: "hand" })).status).toBe(400);
  expect((await post(app, {})).status).toBe(400);
});

const EMAIL = "region-test@biscuit.local";

describe.skipIf(!process.env.DATABASE_URL)("the watched box on the household's camera row", () => {
  const app = createApp({ anaEnv: { KINDRED_AUTH_BYPASS: EMAIL } });
  let householdId = "", token = "";
  const send = (body: unknown) => app.request("/api/biscuit/cam/region", { method: "POST", body: JSON.stringify(body), headers: { authorization: `Bearer ${token}`, "content-type": "application/json" } });
  const row = async () => (await getDb().select().from(cam).where(eq(cam.householdId, householdId)))[0];
  const family = async () => (await app.request("/api/biscuit/family", { headers: { "content-type": "application/json" } })).json();
  beforeAll(async () => {
    const db = getDb();
    await db.delete(household).where(eq(household.ownerEmail, EMAIL));
    const [h] = await db.insert(household).values({ ownerEmail: EMAIL, seniorName: "Rosa", called: "Rosa" }).returning();
    householdId = h.id;
    const t = newToken(); token = t.token;
    await db.insert(device).values({ householdId, kind: "cam", tokenHash: t.hash, label: "sill" });
  });
  afterAll(async () => { await getDb().delete(household).where(eq(household.ownerEmail, EMAIL)); });

  test("a box drawn by hand is stored exactly as sent, with no padding, and Ana's page says so", async () => {
    expect(await (await send({ region: { x: 0.312, y: 0.45, w: 0.25, h: 0.2 }, source: "hand" })).json()).toEqual({ ok: true });
    const r = await row();
    expect(r.region).toEqual({ x: 0.312, y: 0.45, w: 0.25, h: 0.2 });
    expect(r.regionSource).toBe("hand");
    const fam = await family();
    expect(fam.camera.regionSource).toBe("hand");
  });

  test("a new box from SAM's find replaces it and unpauses", async () => {
    await getDb().update(cam).set({ paused: true }).where(eq(cam.householdId, householdId));
    expect((await send({ region: { x: 0.1, y: 0.1, w: 0.5, h: 0.4 }, source: "sam" })).status).toBe(200);
    expect(await row()).toMatchObject({ region: { x: 0.1, y: 0.1, w: 0.5, h: 0.4 }, regionSource: "sam", paused: false });
    expect((await family()).camera.regionSource).toBe("sam");
  });

  test("the phone reports a frozen camera: Ana's page says asleep once, and live clears it", async () => {
    const hb = (video: string) => app.request("/api/biscuit/cam/heartbeat", { method: "POST", body: JSON.stringify({ battery: 50, charging: true, video }), headers: { authorization: `Bearer ${token}`, "content-type": "application/json" } });
    const frozenEvents = () => getDb().select().from(event).where(and(eq(event.householdId, householdId), eq(event.kind, "cam_frozen")));
    expect((await hb("frozen")).status).toBe(200);
    expect((await row()).frozenAt).toBeInstanceOf(Date);
    expect((await family()).camera.status).toBe("asleep");
    expect(await frozenEvents()).toHaveLength(1);
    expect((await hb("frozen")).status).toBe(200);
    expect(await frozenEvents()).toHaveLength(1);
    expect((await hb("live")).status).toBe(200);
    expect((await row()).frozenAt).toBeNull();
    expect((await family()).camera.status).toBe("online");
    expect((await hb("nonsense")).status).toBe(200);
    expect((await row()).frozenAt).toBeNull();
  });

  test("a box with no source, from a phone on the older page, is kept with the source unknown", async () => {
    expect((await send({ region: { x: 0.2, y: 0.2, w: 0.3, h: 0.3 } })).status).toBe(200);
    expect((await row()).regionSource).toBeNull();
    expect((await family()).camera.regionSource).toBeNull();
  });
});
