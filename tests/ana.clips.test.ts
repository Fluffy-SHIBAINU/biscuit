import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { eq } from "drizzle-orm";
import { createApp } from "../server/app.js";
import { WATCH_PROMPTS } from "../server/cam.js";
import { retireClips } from "../server/clips.js";
import { getDb } from "../server/db.js";
import { cam, camSample, device, household } from "../server/schema.js";
import { newToken } from "../server/tokens.js";

// Ana's side of the clips: the two consents, the strip, the taps that tune the mailbox, and retention.
const EMAIL = "clips-test@biscuit.local";
const SECRET = "clips-test-secret";
const frame = (n: number) => `data:image/jpeg;base64,${Buffer.from(`frame${n}`).toString("base64")}`;
const DAY = 86_400_000;
const ago = (days: number) => new Date(Date.now() - days * DAY);

describe.skipIf(!process.env.DATABASE_URL)("clips on Ana's page", () => {
  const app = createApp({
    anaEnv: { KINDRED_AUTH_BYPASS: EMAIL }, chimeEnv: { CRON_SECRET: SECRET }, pushSend: async () => {},
    sam: { detect: async (_j, p) => ("text" in p && p.text === "envelope" ? [{ box: { x: 0.1, y: 0.1, w: 0.3, h: 0.2 }, score: 0.7 }] : []) },
  });
  const req = (path: string, init: RequestInit = {}) => app.request(path, { ...init, headers: { "content-type": "application/json", ...(init.headers as any) } });
  const json = async (path: string, init: RequestInit = {}) => (await req(path, init)).json();
  const patch = (path: string, body: unknown) => json(path, { method: "PATCH", body: JSON.stringify(body) });
  let householdId = "", camToken = "";
  const ids: Record<string, number> = {};
  const insert = async (name: string, row: Partial<typeof camSample.$inferInsert>) => {
    const [r] = await getDb().insert(camSample).values({ householdId, clip: true, scores: {}, frames: [frame(1), frame(2)], ...row }).returning({ id: camSample.id });
    ids[name] = r.id;
  };
  const left = async () => getDb().select({ id: camSample.id, label: camSample.label, clip: camSample.clip }).from(camSample).where(eq(camSample.householdId, householdId));
  const camHeaders = () => ({ authorization: `Bearer ${camToken}` });
  const small = (n: number) => { const form = new FormData(); for (let i = 1; i <= n; i++) form.set(`frame${i}`, new Blob([Buffer.from(`c${i}`) as unknown as BlobPart], { type: "image/jpeg" }), `c${i}.jpg`); return form; };

  beforeAll(async () => {
    const db = getDb();
    await db.delete(household).where(eq(household.ownerEmail, EMAIL));
    const [h] = await db.insert(household).values({ ownerEmail: EMAIL, seniorName: "Rosa Clips", called: "Rosa" }).returning();
    householdId = h.id;
    await db.insert(cam).values({ householdId, region: { x: 0.1, y: 0.1, w: 0.3, h: 0.2 }, setAt: new Date() });
    const t = newToken(); camToken = t.token;
    await db.insert(device).values({ householdId, kind: "cam", tokenHash: t.hash, label: "sill" });
    await insert("fresh1", { level: 18, seen: "envelope", scores: { envelope: 0.8, "mailbox door": 0.2, "mail carrier": 0 } });
    await insert("fresh2", { level: 25, seen: null, scores: { envelope: 0.3, "mailbox door": 0.1, "mail carrier": 0 } });
    await insert("fresh3", { level: 14, seen: "person", scores: { envelope: 0.1, person: 0.7, "mail carrier": 0 } });
    await insert("empty", { frames: [] });
    await insert("old", { at: ago(8) });
    await insert("collect", { clip: false, at: ago(9), frames: [frame(1), frame(2), frame(3)] });
  });
  afterAll(async () => { await getDb().delete(household).where(eq(household.ownerEmail, EMAIL)); });

  test("clips are off until Ana turns them on; the page counts what is kept anyway", async () => {
    const fam = await json("/api/biscuit/family");
    expect(fam.household).toMatchObject({ keepClips: false, shareClips: false, keepClipsAt: null, shareClipsAt: null });
    expect(fam.camera).toMatchObject({ floor: null, gate: null, tuning: null, clips: { pending: 5, total: 5 } });
  });

  test("Ana turns clips on, and the phone's heartbeat learns it", async () => {
    expect(await patch("/api/biscuit/family/clips", { keep: true })).toEqual({ ok: true, keepClips: true, shareClips: false, deleted: 0 });
    const fam = await json("/api/biscuit/family");
    expect(fam.household.keepClips).toBe(true);
    expect(fam.household.keepClipsAt).toBeTruthy();
    const hb = await (await app.request("/api/biscuit/cam/heartbeat", { method: "POST", headers: { ...camHeaders(), "content-type": "application/json" }, body: JSON.stringify({ battery: 80, charging: true }) })).json();
    expect(hb).toEqual({ ok: true, paused: false, gate: null, clips: true });
    expect((await req("/api/biscuit/family/clips", { method: "PATCH", body: "{}" })).status).toBe(400);
  });

  test("the strip lists clips with frames, unlabelled first and newest first, and leaves skipped ones out", async () => {
    let clips = await json("/api/biscuit/family/clips");
    expect(clips.map((c: any) => c.id)).toEqual([ids.fresh3, ids.fresh2, ids.fresh1, ids.old, ids.collect]);
    expect(clips[0]).toMatchObject({ seen: "person", level: 14, label: null, labelledAt: null, frames: [frame(1), frame(2)], scores: { person: 0.7 } });
    expect(await patch(`/api/biscuit/family/clip/${ids.old}`, { label: "skip" })).toMatchObject({ ok: true, id: ids.old, label: "skip", tuning: { taps: 0 } });
    clips = await json("/api/biscuit/family/clips");
    expect(clips.map((c: any) => c.id)).toEqual([ids.fresh3, ids.fresh2, ids.fresh1, ids.collect]);
  });

  test("the mailbox phone keeps a clip row through the real store and fills it with small frames", async () => {
    const form = new FormData();
    form.set("frame1", new Blob([Buffer.alloc(500, 1) as unknown as BlobPart], { type: "image/jpeg" }), "f1.jpg");
    form.set("level", "16");
    const res = await app.request("/api/biscuit/cam/frames", { method: "POST", headers: camHeaders(), body: form });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toMatchObject({ seen: "envelope", callsToday: WATCH_PROMPTS.length, gate: null });
    expect(body.clipId).toBeGreaterThan(0);
    ids.e2e = body.clipId;
    expect(await (await app.request(`/api/biscuit/cam/clip/${ids.e2e}`, { method: "POST", headers: camHeaders(), body: small(2) })).json()).toEqual({ ok: true, frames: 2 });
    // Filled once: a second burst for the same clip is refused.
    expect((await app.request(`/api/biscuit/cam/clip/${ids.e2e}`, { method: "POST", headers: camHeaders(), body: small(1) })).status).toBe(404);
    const clips = await json("/api/biscuit/family/clips");
    expect(clips[0]).toMatchObject({ id: ids.e2e, seen: "envelope", level: 16, label: null, scores: { "mail carrier": 0, person: 0, "mail truck": 0, envelope: 0.7 } });
    expect(clips[0].frames).toHaveLength(2);
  });

  test("a tap labels the clip; from eight taps the mailbox is tuned and the camera row carries the floor and gate", async () => {
    const r = await patch(`/api/biscuit/family/clip/${ids.fresh1}`, { label: "carrier" });
    expect(r).toMatchObject({ ok: true, id: ids.fresh1, label: "carrier", tuning: { taps: 1, positives: 1, negatives: 0, floor: null, gate: null, caught: 1, falseAlarms: 0 } });
    const [row] = await getDb().select().from(camSample).where(eq(camSample.id, ids.fresh1));
    expect(row.label).toBe("carrier");
    expect(row.labelledAt).toBeTruthy();
    let clips = await json("/api/biscuit/family/clips");
    expect(clips.map((c: any) => c.id)).toEqual([ids.e2e, ids.fresh3, ids.fresh2, ids.collect, ids.fresh1]);
    expect(clips[4]).toMatchObject({ label: "carrier" });
    // Seven more taps: three deliveries and four non-deliveries in all.
    expect((await patch(`/api/biscuit/family/clip/${ids.fresh3}`, { label: "carrier" })).tuning.taps).toBe(2);
    expect((await patch(`/api/biscuit/family/clip/${ids.fresh2}`, { label: "nothing" })).tuning).toMatchObject({ taps: 3, floor: null, gate: null });
    const more: [string, number, number][] = [["carrier", 20, 0.75], ["carrier", 22, 0.9], ["nothing", 13, 0.55], ["nothing", 15, 0.2], ["other", 40, 0.1]];
    let last: any = null;
    for (const [label, level, envelope] of more) {
      await insert(`more-${level}`, { level, scores: { envelope, "mailbox door": 0, "mail carrier": 0 } });
      last = await patch(`/api/biscuit/family/clip/${ids[`more-${level}`]}`, { label });
    }
    expect(last.tuning).toMatchObject({ taps: 8, positives: 4, negatives: 4, floor: 0.6, gate: 14, caught: 4, falseAlarms: 0 });
    const [c] = await getDb().select().from(cam).where(eq(cam.householdId, householdId));
    expect(c.floor).toBe(0.6);
    expect(c.gate).toBe(14);
    expect(c.tuning).toMatchObject({ taps: 8 });
    const fam = await json("/api/biscuit/family");
    expect(fam.camera).toMatchObject({ floor: 0.6, gate: 14, tuning: { taps: 8, floor: 0.6 } });
    const hb = await (await app.request("/api/biscuit/cam/heartbeat", { method: "POST", headers: { ...camHeaders(), "content-type": "application/json" }, body: "{}" })).json();
    expect(hb).toMatchObject({ gate: 14, clips: true });
    // The phone's next send is judged at the household's floor and told its gate.
    const form = new FormData();
    form.set("frame1", new Blob([Buffer.alloc(500, 1) as unknown as BlobPart], { type: "image/jpeg" }), "f1.jpg");
    const body = await (await app.request("/api/biscuit/cam/frames", { method: "POST", headers: camHeaders(), body: form })).json();
    expect(body).toMatchObject({ seen: "envelope", gate: 14 });
    clips = await json("/api/biscuit/family/clips");
    expect(clips.filter((x: any) => !x.frames.length)).toHaveLength(0);
  });

  test("a bad label is 400 and a clip that is not this household's is 404", async () => {
    expect((await req(`/api/biscuit/family/clip/${ids.fresh1}`, { method: "PATCH", body: JSON.stringify({ label: "cat" }) })).status).toBe(400);
    expect((await req("/api/biscuit/family/clip/999999999", { method: "PATCH", body: JSON.stringify({ label: "carrier" }) })).status).toBe(404);
    expect((await req("/api/biscuit/family/clip/abc", { method: "PATCH", body: JSON.stringify({ label: "carrier" }) })).status).toBe(400);
  });

  test("retention: unchecked clips go after seven days, tapped ones thirty days after the tap, collect frames never", async () => {
    await insert("stale", { at: ago(8) });
    await insert("staleSkip", { at: ago(8), label: "skip", labelledAt: ago(1) });
    await insert("oldTap", { at: ago(40), label: "nothing", labelledAt: ago(31) });
    await insert("recentTap", { at: ago(40), label: "nothing", labelledAt: ago(5) });
    // The count is global and the chime tick in another test file may have retired these rows first, so the rows are the check.
    const n = await retireClips(getDb(), new Date());
    expect(typeof n).toBe("number");
    const have = new Set((await left()).map((r) => r.id));
    for (const gone of ["stale", "staleSkip", "oldTap", "old"]) expect(have.has(ids[gone])).toBe(false);
    for (const kept of ["recentTap", "collect", "fresh1", "empty"]) expect(have.has(ids[kept])).toBe(true);
    const tick = await (await app.request("/api/biscuit/chime/tick", { method: "POST", headers: { authorization: `Bearer ${SECRET}` } })).json();
    expect(typeof tick.clipsRetired).toBe("number");
  });

  test("help improve Biscuit needs keep; keep off deletes the unchecked clips, and every clip once share is off too; the tuning stays", async () => {
    expect(await patch("/api/biscuit/family/clips", { share: true })).toEqual({ ok: true, keepClips: true, shareClips: true, deleted: 0 });
    let fam = await json("/api/biscuit/family");
    expect(fam.household.shareClipsAt).toBeTruthy();
    await insert("oldTapShared", { at: ago(40), label: "nothing", labelledAt: ago(31) });
    await retireClips(getDb(), new Date());
    expect((await left()).some((r) => r.id === ids.oldTapShared)).toBe(true);
    // The unchecked clips go: "empty", the phone's e2e clip, and the frameless clip its second send made.
    const off = await patch("/api/biscuit/family/clips", { keep: false });
    expect(off).toEqual({ ok: true, keepClips: false, shareClips: true, deleted: 3 });
    let rows = await left();
    expect(rows.filter((r) => r.clip && (!r.label || r.label === "skip"))).toHaveLength(0);
    expect(rows.some((r) => r.id === ids.fresh1)).toBe(true);
    expect(rows.some((r) => r.id === ids.collect)).toBe(true);
    const both = await patch("/api/biscuit/family/clips", { share: false });
    expect(both).toEqual({ ok: true, keepClips: false, shareClips: false, deleted: 10 });
    rows = await left();
    expect(rows.map((r) => r.clip)).toEqual([false]);
    fam = await json("/api/biscuit/family");
    expect(fam.camera.tuning.taps).toBe(8);
    expect(fam.household).toMatchObject({ keepClips: false, shareClips: false, keepClipsAt: null, shareClipsAt: null });
    expect(await patch("/api/biscuit/family/clips", { share: true })).toMatchObject({ keepClips: false, shareClips: false });
    const hb = await (await app.request("/api/biscuit/cam/heartbeat", { method: "POST", headers: { ...camHeaders(), "content-type": "application/json" }, body: "{}" })).json();
    expect(hb).toMatchObject({ clips: false, gate: 14 });
  });
});
