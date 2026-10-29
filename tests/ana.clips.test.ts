import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { eq } from "drizzle-orm";
import { createApp } from "../server/app.js";
import { WATCH_PROMPTS } from "../server/cam.js";
import { retireClips } from "../server/clips.js";
import { getDb } from "../server/db.js";
import { cam, camSample, device, household, type Tuning } from "../server/schema.js";
import { newToken } from "../server/tokens.js";

// Ana's side of the clips: the two consents, the two groups, the taps that tune the mailbox, Biscuit's own
// classifications at a well-taught box, and retention.
const EMAIL = "clips-test@biscuit.local";
const SECRET = "clips-test-secret";
const frame = (n: number) => `data:image/jpeg;base64,${Buffer.from(`frame${n}`).toString("base64")}`;
const DAY = 86_400_000;
const ago = (days: number) => new Date(Date.now() - days * DAY);

describe.skipIf(!process.env.DATABASE_URL)("clips on Ana's page", () => {
  let envelopeScore = 0.7;
  const app = createApp({
    anaEnv: { KINDRED_AUTH_BYPASS: EMAIL }, chimeEnv: { CRON_SECRET: SECRET }, pushSend: async () => {},
    sam: { detect: async (_j, p) => ("text" in p && p.text === "envelope" ? [{ box: { x: 0.1, y: 0.1, w: 0.3, h: 0.2 }, score: envelopeScore }] : []) },
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
  const sendFrames = async (level = "16") => {
    const form = new FormData();
    form.set("frame1", new Blob([Buffer.alloc(500, 1) as unknown as BlobPart], { type: "image/jpeg" }), "f1.jpg");
    form.set("level", level);
    const res = await app.request("/api/biscuit/cam/frames", { method: "POST", headers: camHeaders(), body: form });
    expect(res.status).toBe(200);
    return res.json();
  };
  const idsOf = (list: any[]) => list.map((c) => c.id);

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

  test("clips are off until Ana turns them on; the page counts what is kept anyway, by group", async () => {
    const fam = await json("/api/biscuit/family");
    expect(fam.household).toMatchObject({ keepClips: false, shareClips: false, keepClipsAt: null, shareClipsAt: null });
    expect(fam.camera).toMatchObject({ floor: null, gate: null, tuning: null, clips: { pending: 5, total: 5, attention: 5, classified: 0 } });
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

  test("the two groups: clips with frames that need Ana, newest first, with a poster and a count instead of the frames; skipped ones in neither", async () => {
    let clips = await json("/api/biscuit/family/clips");
    expect(idsOf(clips.attention)).toEqual([ids.fresh3, ids.fresh2, ids.fresh1, ids.old, ids.collect]);
    expect(clips.classified).toEqual([]);
    expect(clips.counts).toEqual({ attention: 5, classified: 0 });
    expect(clips.attention[0]).toMatchObject({ seen: "person", level: 14, label: null, labelledAt: null, labelledBy: null, guess: null, agreed: null, poster: frame(1), frameCount: 2, scores: { person: 0.7 } });
    expect(clips.attention[0].frames).toBeUndefined();
    const one = await json(`/api/biscuit/family/clip/${ids.fresh3}`);
    expect(one).toMatchObject({ id: ids.fresh3, frames: [frame(1), frame(2)], frameCount: 2 });
    expect((await req(`/api/biscuit/family/clip/${ids.empty}`)).status).toBe(404);
    expect((await req("/api/biscuit/family/clip/999999999")).status).toBe(404);
    expect(await patch(`/api/biscuit/family/clip/${ids.old}`, { label: "skip" })).toMatchObject({ ok: true, id: ids.old, label: "skip", tuning: { taps: 0 } });
    clips = await json("/api/biscuit/family/clips");
    expect(idsOf(clips.attention)).toEqual([ids.fresh3, ids.fresh2, ids.fresh1, ids.collect]);
    expect(clips.classified).toEqual([]);
  });

  test("the mailbox phone keeps a clip row with Biscuit's guess through the real store and fills it with small frames", async () => {
    const body = await sendFrames("16");
    expect(body).toMatchObject({ seen: "envelope", callsToday: WATCH_PROMPTS.length, gate: null, guess: { label: "carrier", confidence: 0.7, prompt: "envelope", version: 1 } });
    expect(body.clipId).toBeGreaterThan(0);
    ids.e2e = body.clipId;
    expect(await (await app.request(`/api/biscuit/cam/clip/${ids.e2e}`, { method: "POST", headers: camHeaders(), body: small(2) })).json()).toEqual({ ok: true, frames: 2 });
    // Filled once: a second burst for the same clip is refused.
    expect((await app.request(`/api/biscuit/cam/clip/${ids.e2e}`, { method: "POST", headers: camHeaders(), body: small(1) })).status).toBe(404);
    const clips = await json("/api/biscuit/family/clips");
    expect(clips.attention[0]).toMatchObject({ id: ids.e2e, seen: "envelope", level: 16, label: null, labelledBy: null, frameCount: 2, guess: { label: "carrier", confidence: 0.7, prompt: "envelope" }, agreed: null, scores: { "mail carrier": 0, person: 0, "mail truck": 0, envelope: 0.7 } });
    const one = await json(`/api/biscuit/family/clip/${ids.e2e}`);
    expect(one.frames).toHaveLength(2);
  });

  test("a tap labels the clip as Ana's; from eight taps the mailbox is tuned, the camera row carries the floor and gate, and every prompt its record", async () => {
    const r = await patch(`/api/biscuit/family/clip/${ids.fresh1}`, { label: "carrier" });
    expect(r).toMatchObject({ ok: true, id: ids.fresh1, label: "carrier", tuning: { taps: 1, positives: 1, negatives: 0, floor: null, gate: null, caught: 1, falseAlarms: 0 } });
    const [row] = await getDb().select().from(camSample).where(eq(camSample.id, ids.fresh1));
    expect(row.label).toBe("carrier");
    expect(row.labelledBy).toBe("ana");
    expect(row.labelledAt).toBeTruthy();
    let clips = await json("/api/biscuit/family/clips");
    expect(idsOf(clips.attention)).toEqual([ids.e2e, ids.fresh3, ids.fresh2, ids.collect]);
    expect(idsOf(clips.classified)).toEqual([ids.fresh1]);
    expect(clips.classified[0]).toMatchObject({ label: "carrier", labelledBy: "ana", agreed: null });
    expect(clips.counts).toEqual({ attention: 4, classified: 1 });
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
    // The record per prompt, judged at the household's floor of 0.6: the envelope was right every time it carried the guess.
    expect(last.tuning.prompts.envelope).toMatchObject({ label: "carrier", learned: false, floor: null, fired: 3, agreed: 3, precision: 1 });
    expect(last.tuning.prompts.none).toMatchObject({ label: "nothing", fired: 4, agreed: 3 });
    expect(last.tuning.prompts.person).toMatchObject({ label: "other", learned: false, fired: 1, agreed: 0 });
    expect(last.tuning.auto).toEqual({ classified: 0, corrected: 0 });
    const [c] = await getDb().select().from(cam).where(eq(cam.householdId, householdId));
    expect(c.floor).toBe(0.6);
    expect(c.gate).toBe(14);
    expect(c.tuning).toMatchObject({ taps: 8 });
    const fam = await json("/api/biscuit/family");
    expect(fam.camera).toMatchObject({ floor: 0.6, gate: 14, tuning: { taps: 8, floor: 0.6 }, clips: { attention: 2, classified: 8 } });
    const hb = await (await app.request("/api/biscuit/cam/heartbeat", { method: "POST", headers: { ...camHeaders(), "content-type": "application/json" }, body: "{}" })).json();
    expect(hb).toMatchObject({ gate: 14, clips: true });
    // The phone's next send is judged at the household's floor and told its gate.
    const body = await sendFrames();
    expect(body).toMatchObject({ seen: "envelope", gate: 14 });
    clips = await json("/api/biscuit/family/clips");
    expect(clips.attention.filter((x: any) => !x.frameCount)).toHaveLength(0);
  });

  test("a bad label is 400 and a clip that is not this household's is 404", async () => {
    expect((await req(`/api/biscuit/family/clip/${ids.fresh1}`, { method: "PATCH", body: JSON.stringify({ label: "cat" }) })).status).toBe(400);
    expect((await req(`/api/biscuit/family/clip/${ids.fresh1}`, { method: "PATCH", body: "{}" })).status).toBe(400);
    expect((await req("/api/biscuit/family/clip/999999999", { method: "PATCH", body: JSON.stringify({ label: "carrier" }) })).status).toBe(404);
    expect((await req("/api/biscuit/family/clip/abc", { method: "PATCH", body: JSON.stringify({ label: "carrier" }) })).status).toBe(400);
  });

  test("at a well-taught box Biscuit classifies a sure clip itself; Not right hands it back to Ana and counts against the prompt; her tap is the final word", async () => {
    // Twenty-five taps on record and an envelope right twelve times in twelve, as the taps would have left it.
    const taught: Tuning = { taps: 25, positives: 15, negatives: 10, floor: null, gate: 14, caught: 15, falseAlarms: 0, at: new Date().toISOString(), prompts: { envelope: { label: "carrier", learned: false, floor: null, fired: 12, agreed: 12, precision: 1 } }, auto: { classified: 0, corrected: 0 } };
    await getDb().update(cam).set({ floor: null, tuning: taught }).where(eq(cam.householdId, householdId));
    envelopeScore = 0.96;
    const body = await sendFrames("21");
    envelopeScore = 0.7;
    expect(body).toMatchObject({ seen: "envelope", guess: { label: "carrier", confidence: 0.95, prompt: "envelope", auto: true } });
    ids.auto = body.clipId;
    expect(await (await app.request(`/api/biscuit/cam/clip/${ids.auto}`, { method: "POST", headers: camHeaders(), body: small(3) })).json()).toEqual({ ok: true, frames: 3 });
    let clips = await json("/api/biscuit/family/clips");
    expect(idsOf(clips.attention)).not.toContain(ids.auto);
    expect(clips.classified[0]).toMatchObject({ id: ids.auto, label: "carrier", labelledBy: "biscuit", agreed: true, guess: { auto: true } });
    const [row] = await getDb().select().from(camSample).where(eq(camSample.id, ids.auto));
    expect(row).toMatchObject({ label: "carrier", labelledBy: "biscuit" });
    expect(row.labelledAt).toBeTruthy();
    // Not right: back to attention, counted as a tap against the envelope.
    const rejected = await patch(`/api/biscuit/family/clip/${ids.auto}`, { reject: true });
    expect(rejected).toMatchObject({ ok: true, id: ids.auto, label: null, rejected: true });
    expect(rejected.tuning.auto).toEqual({ classified: 1, corrected: 1 });
    expect(rejected.tuning.prompts.envelope).toMatchObject({ fired: 4, agreed: 3, precision: 0.75 });
    clips = await json("/api/biscuit/family/clips");
    expect(clips.attention.some((c: any) => c.id === ids.auto)).toBe(true);
    expect(clips.attention.find((c: any) => c.id === ids.auto)).toMatchObject({ label: null, labelledBy: "ana", guess: { rejected: true, auto: true }, agreed: null });
    expect(idsOf(clips.classified)).not.toContain(ids.auto);
    // Her tap settles it: Biscuit was right after all.
    const settled = await patch(`/api/biscuit/family/clip/${ids.auto}`, { label: "carrier" });
    expect(settled.tuning.auto).toEqual({ classified: 1, corrected: 0 });
    expect(settled.tuning.prompts.envelope).toMatchObject({ fired: 4, agreed: 4, precision: 1 });
    clips = await json("/api/biscuit/family/clips");
    expect(clips.classified[0]).toMatchObject({ id: ids.auto, label: "carrier", labelledBy: "ana", agreed: true });
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
    for (const kept of ["recentTap", "collect", "fresh1", "empty", "auto"]) expect(have.has(ids[kept])).toBe(true);
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
    expect(both).toEqual({ ok: true, keepClips: false, shareClips: false, deleted: 11 });
    rows = await left();
    expect(rows.map((r) => r.clip)).toEqual([false]);
    fam = await json("/api/biscuit/family");
    expect(fam.camera.tuning.taps).toBe(9);
    expect(fam.household).toMatchObject({ keepClips: false, shareClips: false, keepClipsAt: null, shareClipsAt: null });
    expect(await patch("/api/biscuit/family/clips", { share: true })).toMatchObject({ keepClips: false, shareClips: false });
    const hb = await (await app.request("/api/biscuit/cam/heartbeat", { method: "POST", headers: { ...camHeaders(), "content-type": "application/json" }, body: "{}" })).json();
    expect(hb).toMatchObject({ clips: false, gate: 14 });
  });
});
