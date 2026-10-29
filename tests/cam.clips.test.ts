import { expect, test } from "vitest";
import { createApp } from "../server/app.js";
import { WATCH_PROMPTS } from "../server/cam.js";
import { MAX_CLIP_FRAME_BYTES } from "../server/clips.js";

// Clips: a household that opted in on Ana's page keeps, for each movement, the watch prompts' scores on the first frame
// and a row the phone then fills with up to eight small frames. Nothing is kept for a household that did not opt in.
const linked = (household: Record<string, unknown> = {}) => async () => ({ device: { id: "d1", householdId: "h1", kind: "cam" } as any, household: { id: "h1", called: "Rosa", language: "en", ownerEmail: "ana@example.org", keepClips: false, ...household } as any });
const camRow = (extra: Record<string, unknown> = {}) => ({ householdId: "h1", region: { x: 0, y: 0, w: 1, h: 1 }, paused: false, samCallsToday: 0, samDay: null, testStatus: "works", floor: null, gate: null, tuning: null, ...extra }) as any;
const blob = (bytes = 1000) => new Blob([Buffer.alloc(bytes, 1) as unknown as BlobPart], { type: "image/jpeg" });

function harness(o: { household?: Record<string, unknown>; cam?: Record<string, unknown>; scores?: Record<string, number>; env?: Record<string, string>; keepFails?: boolean } = {}) {
  const kept: any[] = [], attached: any[] = [], prompts: string[] = [], recorded: any[] = [];
  const app = createApp({
    lookup: linked(o.household), camEnv: o.env ?? {},
    camStore: {
      get: async () => camRow(o.cam), update: async () => {},
      keep: async (row: any) => { if (o.keepFails) throw new Error("relation biscuit_cam_sample does not exist"); kept.push(row); return 41; },
      attach: async (id: number, householdId: string, frames: string[]) => { attached.push({ id, householdId, frames }); return id === 41; },
    },
    sam: { detect: async (_j, p) => { if (!("text" in p)) return []; prompts.push(p.text); const score = o.scores?.[p.text]; return score ? [{ box: { x: 0.1, y: 0.1, w: 0.3, h: 0.2 }, score }] : []; } },
    events: { count: async () => 0, record: async (_h: string, _d: string | null, kind: string, data?: Record<string, unknown>) => { recorded.push({ kind, data }); return 1; } }, pushSend: async () => {},
  });
  const frames = (fields: Record<string, string> = {}, n = 2) => { const form = new FormData(); for (let i = 1; i <= n; i++) form.set(`frame${i}`, blob(), `f${i}.jpg`); for (const [k, v] of Object.entries(fields)) form.set(k, v); return app.request("/api/biscuit/cam/frames", { method: "POST", body: form, headers: { authorization: "Bearer x" } }); };
  const clip = (id: string, blobs: Blob[]) => { const form = new FormData(); blobs.forEach((b, i) => form.set(`frame${i + 1}`, b, `c${i + 1}.jpg`)); return app.request(`/api/biscuit/cam/clip/${id}`, { method: "POST", body: form, headers: { authorization: "Bearer x" } }); };
  return { app, kept, attached, prompts, frames, clip, recorded };
}

test("an opted-in household: the watch prompts are scored on the first frame, a clip row is kept, and the reply carries its id and the gate", async () => {
  const h = harness({ household: { keepClips: true }, cam: { gate: 14 }, scores: { envelope: 0.71, person: 0.2 } });
  const res = await h.frames({ level: "17.5" });
  expect(res.status).toBe(200);
  expect(await res.json()).toEqual({ seen: "envelope", callsToday: 4, gate: 14, clipId: 41, guess: { label: "carrier", confidence: 0.71, prompt: "envelope", version: 1 } });
  expect(h.prompts).toEqual([...WATCH_PROMPTS]);
  // Every movement the phone sent shows on Ana's page, with what SAM saw and the motion level, image or no image.
  expect(h.recorded).toContainEqual({ kind: "cam_motion", data: { seen: "envelope", level: 17.5 } });
  expect(h.kept).toHaveLength(1);
  // Biscuit's guess rides on the row from the start; no label until Ana taps or the box is well taught.
  expect(h.kept[0]).toEqual({ householdId: "h1", deviceId: "d1", test: false, clip: true, level: 17.5, seen: "envelope", scores: { "mail carrier": 0, person: 0.2, "mail truck": 0, envelope: 0.71 }, frames: [], guess: { label: "carrier", confidence: 0.71, prompt: "envelope", version: 1 } });
});

test("the household's own floor decides what counts as seen", async () => {
  const h = harness({ household: { keepClips: true }, cam: { floor: 0.8 }, scores: { envelope: 0.71 } });
  expect(await (await h.frames()).json()).toEqual({ seen: null, callsToday: 8, gate: null, clipId: 41, guess: { label: "nothing", confidence: 0.56, prompt: null, version: 1 } });
  expect(h.kept[0]).toMatchObject({ seen: null, scores: { envelope: 0.71 } });
  const low = harness({ household: { keepClips: true }, cam: { floor: 0.4 }, scores: { person: 0.45 } });
  expect(await (await low.frames()).json()).toMatchObject({ seen: "person", callsToday: 4, guess: { label: "other", prompt: "person" } });
});

test("a household that has not opted in keeps nothing: the usual cascade runs and the reply has no clip id", async () => {
  const h = harness();
  expect(await (await h.frames()).json()).toEqual({ seen: null, callsToday: 8, gate: null });
  expect(h.prompts).toEqual(["mail carrier", "mail carrier", "person", "person", "mail truck", "mail truck", "envelope", "envelope"]);
  expect(h.kept).toEqual([]);
});

test("the founder's collect mode keeps its full frames instead of a clip", async () => {
  const c = harness({ household: { keepClips: true }, env: { CAM_COLLECT_OWNER: "ana@example.org" }, scores: { envelope: 0.7 } });
  const body = await (await c.frames({ collect: "1", level: "9" })).json();
  expect(body).toMatchObject({ seen: "envelope", kept: true });
  expect(body.clipId).toBeUndefined();
  expect(c.kept).toHaveLength(1);
  expect(c.kept[0]).toMatchObject({ clip: false, level: 9 });
  expect(c.kept[0].frames).toHaveLength(2);
});

test("POST /cam/clip/:id attaches up to eight small frames to this household's clip", async () => {
  const h = harness();
  const res = await h.clip("41", Array.from({ length: 8 }, () => blob(2000)));
  expect(res.status).toBe(200);
  expect(await res.json()).toEqual({ ok: true, frames: 8 });
  expect(h.attached).toHaveLength(1);
  expect(h.attached[0]).toMatchObject({ id: 41, householdId: "h1" });
  expect(h.attached[0].frames).toHaveLength(8);
  expect(h.attached[0].frames[0]).toMatch(/^data:image\/jpeg;base64,/);
  expect((await h.clip("41", Array.from({ length: 9 }, () => blob()))).status).toBe(400);
  expect((await h.clip("41", [blob(MAX_CLIP_FRAME_BYTES + 1)])).status).toBe(413);
  expect((await h.clip("41", [])).status).toBe(400);
  expect((await h.clip("7", [blob()])).status).toBe(404);
  expect((await h.clip("x", [blob()])).status).toBe(400);
  expect(MAX_CLIP_FRAME_BYTES).toBe(64_000);
});

test("a clip row that cannot be kept does not break the watch", async () => {
  const h = harness({ household: { keepClips: true }, keepFails: true, scores: { envelope: 0.7 } });
  const res = await h.frames();
  expect(res.status).toBe(200);
  expect(await res.json()).toEqual({ seen: "envelope", callsToday: 4, gate: null, guess: { label: "carrier", confidence: 0.7, prompt: "envelope", version: 1 } });
});

test("at a well-taught box a clip whose guess rests on a trusted prompt is classified by Biscuit as it is made", async () => {
  const tuning = { taps: 25, positives: 15, negatives: 10, floor: null, gate: null, caught: 15, falseAlarms: 0, at: "", prompts: { envelope: { label: "carrier", learned: false, floor: null, fired: 12, agreed: 12, precision: 1 } } };
  const h = harness({ household: { keepClips: true }, cam: { tuning }, scores: { envelope: 0.95 } });
  const body = await (await h.frames({ level: "20" })).json();
  expect(body).toMatchObject({ seen: "envelope", clipId: 41, guess: { label: "carrier", confidence: 0.95, prompt: "envelope", auto: true } });
  expect(h.kept[0]).toMatchObject({ label: "carrier", labelledBy: "biscuit", guess: { label: "carrier", prompt: "envelope", auto: true } });
  expect(h.kept[0].labelledAt).toBeInstanceOf(Date);
  // The same score at a box with fewer taps, or on a prompt without the record, waits for Ana.
  const young = harness({ household: { keepClips: true }, cam: { tuning: { ...tuning, taps: 19 } }, scores: { envelope: 0.95 } });
  await young.frames();
  expect(young.kept[0].label).toBeUndefined();
  expect(young.kept[0].guess.auto).toBeUndefined();
  const otherPrompt = harness({ household: { keepClips: true }, cam: { tuning }, scores: { "mail truck": 0.95 } });
  await otherPrompt.frames();
  expect(otherPrompt.kept[0].label).toBeUndefined();
});

test("a mapping learned away from the carrier stops the chime on that prompt, and the prompt's own floor is the one that counts", async () => {
  const tuning = { taps: 12, positives: 6, negatives: 6, floor: null, gate: null, caught: 6, falseAlarms: 0, at: "", prompts: { person: { label: "other", learned: true, floor: 0.8, fired: 6, agreed: 6, precision: 1 } } };
  const under = harness({ household: { keepClips: true }, cam: { tuning }, scores: { person: 0.7 } });
  expect(await (await under.frames()).json()).toMatchObject({ seen: null, guess: { label: "nothing", prompt: null } });
  const over = harness({ household: { keepClips: true }, cam: { tuning }, scores: { person: 0.9 } });
  const body = await (await over.frames()).json();
  expect(body).toMatchObject({ seen: null, guess: { label: "other", prompt: "person" } });
  expect(over.recorded.some((r) => r.kind === "mail_seen")).toBe(false);
  // A household that has not opted in gets the same judgement: a neighbour at the box is not mail here.
  const plain = harness({ cam: { tuning }, scores: { person: 0.9 } });
  expect(await (await plain.frames()).json()).toEqual({ seen: null, callsToday: 6, gate: null });
});
