import { expect, test } from "vitest";
import { EarCore, Segmenter } from "../src/lib/ear.js";

const RATE = 16000;
const frame = (ms, loud) => new Float32Array(Math.round(RATE * ms / 1000)).fill(loud ? 0.3 : 0.001);

// The ear hears all the time: a segmenter cuts the stream into utterances at 1.2 s of quiet, keeps a little sound from
// before the first word, drops blips shorter than 300 ms, and cuts a very long one at 10 s.
test("the segmenter cuts an utterance at silence, with a pre-roll, and ignores blips", () => {
  const seg = new Segmenter({ sampleRate: RATE, silenceMs: 1200, minVoicedMs: 300, maxMs: 10_000, prerollMs: 300 });
  let t = 0;
  const push = (ms, loud) => { t += ms; return seg.push(frame(ms, loud), t); };
  for (let i = 0; i < 10; i++) expect(push(100, false)).toBeNull();
  expect(seg.inUtterance).toBe(false);
  expect(push(100, true)).toBeNull();
  expect(seg.inUtterance).toBe(true);
  for (let i = 0; i < 4; i++) expect(push(100, true)).toBeNull();
  for (let i = 0; i < 11; i++) expect(push(100, false)).toBeNull();
  const utt = push(100, false);
  expect(utt).not.toBeNull();
  expect(utt.voicedMs).toBeCloseTo(500, -1);
  // 300 ms of pre-roll + 500 ms voiced + 1200 ms quiet
  expect(utt.samples.length).toBe(Math.round(RATE * 2.0));
  expect(seg.inUtterance).toBe(false);
  // a 100 ms blip followed by quiet is nothing
  push(100, true);
  for (let i = 0; i < 11; i++) push(100, false);
  expect(push(100, false)).toBeNull();
  // a long one is cut at 10 s even without quiet
  let cut = null;
  for (let i = 0; i < 120 && !cut; i++) cut = push(100, true);
  expect(cut).not.toBeNull();
  expect(cut.ms).toBeLessThanOrEqual(10_100);
});

// Who gets an utterance: a screen that asked for the next one, else the default handler; nothing while Biscuit speaks.
test("the ear core hands an utterance to a waiting screen first, else to the handler, and drops what it hears while speaking", async () => {
  let now = 0;
  const timers = [];
  const core = new EarCore({ now: () => now, setTimer: (fn, ms) => { timers.push({ fn, at: now + ms }); return timers.length; }, clearTimer: (id) => { timers[id - 1] = null; } });
  const handled = [];
  core.setHandler((u) => handled.push(u));
  core.begin(); expect(core.end({ blob: "a", ms: 900 })).toBe("handled");
  expect(handled).toEqual([{ blob: "a", ms: 900, spoke: true }]);
  const p = core.next({ maxMs: 6000 });
  core.begin(); expect(core.end({ blob: "b", ms: 700 })).toBe("claimed");
  expect(await p).toEqual({ blob: "b", ms: 700, spoke: true });
  expect(handled).toHaveLength(1);
  core.mute(true);
  core.begin(); expect(core.end({ blob: "echo", ms: 500 })).toBe("dropped");
  core.mute(false);
  // a 300 ms grace after Biscuit stops, so the tail of his own voice is not heard
  core.begin(); expect(core.end({ blob: "tail", ms: 200 })).toBe("dropped");
  now = 400;
  core.begin(); expect(core.end({ blob: "c", ms: 400 })).toBe("handled");
  // one that began while Biscuit was still speaking is dropped even when it ends after
  core.mute(true); core.begin(); core.mute(false); now = 2000;
  expect(core.end({ blob: "overlap", ms: 1500 })).toBe("dropped");
  expect(handled.map((u) => u.blob)).toEqual(["a", "c"]);
});

test("a waiting screen hears nothing after its time is up, unless words are already under way", async () => {
  let now = 0;
  const timers = [];
  const core = new EarCore({ now: () => now, setTimer: (fn, ms) => { timers.push({ fn, at: now + ms }); return timers.length; }, clearTimer: (id) => { timers[id - 1] = null; } });
  const fire = () => { for (const t of timers) if (t && t.at <= now) { t.fn(); timers[timers.indexOf(t)] = null; } };
  const quiet = core.next({ maxMs: 6000 });
  now = 6000; fire();
  expect(await quiet).toEqual({ blob: null, ms: 0, spoke: false });
  const late = core.next({ maxMs: 6000 });
  core.begin();
  now = 12_500; fire();
  expect(core.end({ blob: "d", ms: 2000 })).toBe("claimed");
  expect(await late).toEqual({ blob: "d", ms: 2000, spoke: true });
});

// Second review: words under way when Biscuit starts talking are his too (dropped); a claim displaced by a newer one or
// by a screen change says so instead of pretending silence; a blip after the deadline still ends the wait.
test("the core drops an utterance that Biscuit talked over, releases a stale claim, and ends a wait on a blip", async () => {
  let now = 0, path = "/mail";
  const timers = [];
  const core = new EarCore({ now: () => now, pathNow: () => path, setTimer: (fn, ms) => { timers.push({ fn, at: now + ms }); return timers.length; }, clearTimer: (id) => { timers[id - 1] = null; } });
  const fire = () => { for (const t of timers) if (t && t.at <= now) { t.fn(); timers[timers.indexOf(t)] = null; } };
  const handled = [];
  core.setHandler((u) => handled.push(u.blob));
  // Rosa is mid-sentence when Biscuit begins to speak: the whole clip is dropped
  core.begin(); core.mute(true); core.mute(false); now = 1000;
  expect(core.end({ blob: "rosa+biscuit", ms: 3000 })).toBe("dropped");
  // a newer claim displaces the older one, which learns it was displaced
  const first = core.next({ maxMs: 6000 });
  const second = core.next({ maxMs: 6000 });
  expect(await first).toEqual({ blob: null, ms: 0, spoke: false, displaced: true });
  core.begin(); expect(core.end({ blob: "b", ms: 500 })).toBe("claimed");
  expect(await second).toEqual({ blob: "b", ms: 500, spoke: true });
  // the screen that asked has gone: its claim is released and the words go to the handler
  const stale = core.next({ maxMs: 6000 });
  path = "/";
  core.begin(); expect(core.end({ blob: "c", ms: 500 })).toBe("handled");
  expect(await stale).toEqual({ blob: null, ms: 0, spoke: false, displaced: true });
  expect(handled).toEqual(["c"]);
  // release() ends a wait from a screen's cleanup
  const gone = core.next({ maxMs: 6000 });
  core.release();
  expect(await gone).toEqual({ blob: null, ms: 0, spoke: false, displaced: true });
  // the deadline passes while a sound is under way, and the sound turns out to be a blip: the wait ends as quiet
  const waiting = core.next({ maxMs: 6000 });
  core.begin(); now = 7000; fire();
  core.blip();
  expect(await waiting).toEqual({ blob: null, ms: 0, spoke: false });
});

// The ear is wanted on every one of Rosa's pages once she has agreed, by the consent or by a tap on Let Me Hear; never when paused.
test("earWanted: consent or a tap opens the ear, pause closes it", async () => {
  const { earWanted } = await import("../src/lib/ear.js");
  const base = { deviceToken: "t", kind: "rosa", consentedAt: null, earAllowedAt: null, earPaused: false };
  expect(earWanted(base)).toBe(false);
  expect(earWanted({ ...base, consentedAt: "2026-10-30T12:00:00Z" })).toBe(true);
  expect(earWanted({ ...base, earAllowedAt: "2026-10-30T12:00:00Z" })).toBe(true);
  expect(earWanted({ ...base, earAllowedAt: "2026-10-30T12:00:00Z", earPaused: true })).toBe(false);
  expect(earWanted({ ...base, consentedAt: "x", kind: "cam" })).toBe(false);
});
