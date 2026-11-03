// Biscuit's ear: the microphone stays open while the app is up, and the sound is cut into utterances at a pause. Each
// utterance goes to the screen that asked for the next one (a question, the mail), else to the hearing router, which
// turns it into words on the server and answers. Nothing is heard while Biscuit himself speaks, and nothing is kept:
// the sound leaves the phone only as one clip for the words, never stored. Rosa can pause the ear; a tap wakes it.
import { downsample, encodeWav, isSilent } from "./audio.js";
import { store } from "./store.js";
import { diag } from "./diag.js";

/** Cuts a stream of audio frames into utterances: speech, then quiet; blips are dropped; very long ones are cut. */
export class Segmenter {
  constructor({ sampleRate, silenceMs = 1200, minVoicedMs = 300, maxMs = 10_000, prerollMs = 300, threshold = 0.02 }) {
    Object.assign(this, { sampleRate, silenceMs, minVoicedMs, maxMs, prerollMs, threshold });
    this.preroll = []; this.prerollMsHeld = 0; this.active = null; this.level = 0;
  }
  get inUtterance() { return this.active !== null; }
  push(frame, now) {
    const ms = (frame.length / this.sampleRate) * 1000;
    const quiet = isSilent(frame, this.threshold);
    this.level = quiet ? 0 : 1;
    if (!this.active) {
      // keep about prerollMs of sound from before the first word
      while (this.preroll.length && this.prerollMsHeld - (this.preroll[0].length / this.sampleRate) * 1000 >= this.prerollMs) this.prerollMsHeld -= (this.preroll.shift().length / this.sampleRate) * 1000;
      this.preroll.push(frame); this.prerollMsHeld += ms;
      if (quiet) return null;
      this.active = { frames: [...this.preroll], voicedMs: 0, totalMs: this.prerollMsHeld, quietMs: 0, startedAt: now };
      this.preroll = []; this.prerollMsHeld = 0;
      // the frame that woke us is already in the pre-roll
      this.active.voicedMs += ms;
      return null;
    }
    const a = this.active;
    a.frames.push(frame); a.totalMs += ms;
    if (quiet) a.quietMs += ms; else { a.quietMs = 0; a.voicedMs += ms; }
    if (a.quietMs >= this.silenceMs || a.totalMs >= this.maxMs) return this.finish();
    return null;
  }
  finish() {
    const a = this.active; this.active = null;
    if (!a || a.voicedMs < this.minVoicedMs) return null;
    const total = a.frames.reduce((n, f) => n + f.length, 0);
    const samples = new Float32Array(total);
    let o = 0; for (const f of a.frames) { samples.set(f, o); o += f.length; }
    return { samples, ms: Math.round(a.totalMs), voicedMs: Math.round(a.voicedMs), startedAt: a.startedAt };
  }
}

const GRACE_MS = 300;
export const RECOGNITION_GRACE_MS = 1500;

/** Who hears an utterance: a waiting screen first, else the handler; nothing while Biscuit speaks or just stopped. */
export class EarCore {
  constructor({ now = () => Date.now(), pathNow = () => (typeof window === "undefined" ? "" : window.location.pathname), setTimer = (fn, ms) => setTimeout(fn, ms), clearTimer = (id) => clearTimeout(id), onChange = null } = {}) {
    Object.assign(this, { now, pathNow, setTimer, clearTimer, onChange });
    this.handler = null; this.claim = null; this.muted = false; this.mutedUntil = 0; this.startedMuted = false; this.inUtterance = false;
  }
  setHandler(fn) { this.handler = fn; }
  /** Biscuit is talking: nothing is heard, and whatever was under way when he began is his too. */
  mute(on) {
    if (on) { this.muted = true; if (this.inUtterance) this.startedMuted = true; }
    else { this.muted = false; this.mutedUntil = this.now() + (this.graceMs ?? GRACE_MS); }
    if (this.onChange) this.onChange();
  }
  isMuted() { return this.muted || this.now() < this.mutedUntil; }
  static QUIET = Object.freeze({ blob: null, ms: 0, spoke: false });
  static DISPLACED = Object.freeze({ blob: null, ms: 0, spoke: false, displaced: true });
  /**
   * The next utterance, or quiet (`spoke: false`) after maxMs; words already under way at the deadline still arrive. A newer
   * claim, a screen change or release() ends an older wait with `displaced: true`, which a screen treats as "not for me".
   */
  next({ maxMs = 6000 } = {}) {
    if (this.claim) this.resolveClaim({ ...EarCore.DISPLACED });
    return new Promise((resolve) => {
      const claim = { resolve, timer: null, expired: false, path: this.pathNow() };
      claim.timer = this.setTimer(() => { if (this.inUtterance && !this.isMuted()) claim.expired = true; else this.resolveClaim({ ...EarCore.QUIET }); }, maxMs);
      this.claim = claim;
    });
  }
  resolveClaim(result) { const c = this.claim; this.claim = null; if (!c) return; this.clearTimer(c.timer); c.resolve(result); }
  /** A screen that asked is going away: its wait ends now. */
  release() { if (this.claim) this.resolveClaim({ ...EarCore.DISPLACED }); }
  begin() { this.inUtterance = true; this.startedMuted = this.isMuted(); }
  /** The sound under way was a blip, not words. A wait whose deadline passed meanwhile ends as quiet. */
  blip() { this.inUtterance = false; if (this.claim?.expired) this.resolveClaim({ ...EarCore.QUIET }); }
  end({ blob, ms }) {
    this.inUtterance = false;
    if (this.startedMuted || this.isMuted()) { if (this.claim?.expired) this.resolveClaim({ ...EarCore.QUIET }); return "dropped"; }
    const utt = { blob, ms, spoke: true };
    if (this.claim && this.claim.path !== this.pathNow()) this.release();
    if (this.claim) { this.resolveClaim(utt); return "claimed"; }
    if (this.handler) this.handler(utt);
    return "handled";
  }
}

// The live ear on the phone: one microphone stream, one audio graph, the segmenter and the core above.
const live = { status: "off", error: null, stream: null, ctx: null, node: null, source: null, seg: null, retry: null, level: 0, mode: null };
const watchers = new Set();
let lastStatus = "";
const notify = () => { if (live.status !== lastStatus) { lastStatus = live.status; diag("ear", live.status + (live.error ? ` (${live.error})` : "")); } watchers.forEach((w) => w()); };
export const core = new EarCore({ onChange: notify });
// For scripted runs (the demo recorder, a test on a laptop with no microphone): words handed straight to the ear, through
// the same router real speech takes. A page-local function; it does nothing a tap on the screen could not.
if (typeof window !== "undefined") window.biscuitHear = (text) => { core.begin(); return core.end({ blob: { text: String(text) }, ms: 0 }); };
if (typeof window !== "undefined" && (window.SpeechRecognition || window.webkitSpeechRecognition)) core.graceMs = RECOGNITION_GRACE_MS;
export const earMuted = () => core.isMuted();
export function subscribeEar(fn) { watchers.add(fn); return () => watchers.delete(fn); }
export function earStatus() { return live.status; }
export function earLevel() { return live.level; }
export function earError() { return live.error; }

function wavBlob(samples, rate) {
  return new Blob([encodeWav(downsample(samples, rate, 16000), 16000)], { type: "audio/wav" });
}

function teardown() {
  stopRecognition();
  try { live.node?.disconnect(); live.source?.disconnect(); } catch { /* gone */ }
  live.stream?.getTracks().forEach((t) => { try { t.stop(); } catch { /* gone */ } });
  live.ctx?.close().catch(() => {});
  live.node = live.source = live.stream = live.ctx = live.seg = null;
  if (core.inUtterance) core.blip();
}

/** Should the ear be open now: a linked Rosa phone, her yes (the consent, or a tap on Let Me Hear), not paused by her. */
export function earWanted(st = store.get()) {
  return Boolean(st.deviceToken && st.kind === "rosa" && (st.consentedAt || st.earAllowedAt) && !st.earPaused);
}

/**
 * How Biscuit hears. "recognition": the phone's own speech recognizer (SpeechRecognition), which hands back words and
 * never opens a capture of our own; on an iPhone an open microphone capture turns the loudspeaker down to the earpiece and
 * leaves it there, so this is the way there. "capture": our microphone stream, the segmenter and the server's transcriber.
 * Settings can force either; "auto" takes recognition wherever the phone offers it.
 */
export function earMode(st = store.get()) {
  const SR = typeof window !== "undefined" && (window.SpeechRecognition || window.webkitSpeechRecognition);
  if (st.earMode === "capture" || st.earMode === "recognition") return st.earMode === "recognition" && !SR ? "capture" : st.earMode;
  return SR ? "recognition" : "capture";
}
let rec = null;
function startRecognition() {
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  const r = new SR();
  r.continuous = true; r.interimResults = false; r.maxAlternatives = 1; r.lang = store.get().household?.language === "es" ? "es-US" : "en-US";
  const gen = ++startGen;
  rec = r;
  r.onstart = () => { if (rec !== r) return; live.status = "on"; live.error = null; notify(); };
  r.onaudiostart = () => { if (rec === r && live.status !== "on") { live.status = "on"; notify(); } };
  r.onspeechstart = () => { if (rec === r) { live.level = 1; notify(); } };
  r.onspeechend = () => { if (rec === r) { live.level = 0; notify(); } };
  r.onresult = (e) => {
    if (rec !== r) return;
    for (let i = e.resultIndex; i < e.results.length; i++) {
      const res = e.results[i];
      if (!res.isFinal) continue;
      const text = String(res[0]?.transcript || "").trim();
      if (!text) continue;
      // words arrive a moment after they were said: the core decides whether Biscuit was talking then
      core.begin(); core.end({ blob: { text }, ms: 0 });
    }
    live.level = 0; notify();
  };
  r.onerror = (e) => {
    if (rec !== r) return;
    const kind = e?.error || "error";
    diag("recognition", kind);
    if (kind === "not-allowed" || kind === "service-not-allowed") { rec = null; live.status = "blocked"; live.error = kind; notify(); }
    // "no-speech", "aborted", "network": onend follows and restarts
  };
  r.onend = () => {
    if (rec !== r || gen !== startGen) return;
    // the recognizer stops by itself after a while of quiet: start it again while it is still wanted
    rec = null;
    if (live.status === "on" && earWanted() && awake && !cameraOpen() && document.visibilityState === "visible") setTimeout(() => { if (live.status === "on" && !rec && gen === startGen) startRecognition(); }, 250);
    else if (live.status === "on") { live.status = "off"; notify(); }
  };
  try { r.start(); live.status = "starting"; notify(); }
  catch (err) { rec = null; live.status = "off"; live.error = err?.name || "failed"; notify(); scheduleRetry(); }
}
function stopRecognition() {
  const r = rec; rec = null;
  if (r) { r.onend = null; r.onresult = null; r.onerror = null; try { r.abort(); } catch { /* gone */ } }
}

/** Opens the ear: the phone's recognizer, or the microphone. Fails quietly into "blocked" when the phone needs a tap first. */
let startGen = 0;
export async function startEar() {
  if (live.status === "on" || live.status === "starting") return live.status;
  live.mode = earMode();
  if (live.mode === "recognition") { startRecognition(); return live.status; }
  if (typeof navigator === "undefined" || !navigator.mediaDevices?.getUserMedia) { live.status = "blocked"; live.error = "unsupported"; notify(); return live.status; }
  const gen = ++startGen;
  live.status = "starting"; live.error = null; notify();
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } });
    // A hold (Biscuit began to speak), a stop or a newer start happened while the microphone was opening: this one is void.
    if (gen !== startGen || held || live.status !== "starting") { stream.getTracks().forEach((t) => t.stop()); if (live.status === "starting") live.status = "off"; notify(); return live.status; }
    if (!earWanted()) { stream.getTracks().forEach((t) => t.stop()); live.status = "off"; notify(); return live.status; }
    const Ctx = window.AudioContext || window.webkitAudioContext;
    const ctx = new Ctx();
    if (ctx.state === "suspended") await ctx.resume().catch(() => {});
    const source = ctx.createMediaStreamSource(stream);
    const node = ctx.createScriptProcessor(4096, 1, 1);
    const seg = new Segmenter({ sampleRate: ctx.sampleRate });
    node.onaudioprocess = (e) => {
      if (live.seg !== seg) return;
      const data = new Float32Array(e.inputBuffer.getChannelData(0));
      const was = seg.inUtterance;
      const utt = seg.push(data, Date.now());
      if (!was && seg.inUtterance) core.begin();
      if (seg.level !== live.level) { live.level = seg.level; notify(); }
      if (utt) core.end({ blob: wavBlob(utt.samples, ctx.sampleRate), ms: utt.ms });
      else if (was && !seg.inUtterance) core.blip();
    };
    source.connect(node); node.connect(ctx.destination);
    stream.getTracks().forEach((t) => { t.onended = () => lost("ended"); t.onmute = () => lost("muted"); });
    Object.assign(live, { stream, ctx, node, source, seg, status: "on", error: null });
    notify();
  } catch (err) {
    teardown();
    // A refusal needs a tap (or the phone's settings); anything else (the phone was busy, a call came in) is tried again.
    const refused = err?.name === "NotAllowedError" || err?.name === "SecurityError" || err?.name === "NotFoundError";
    live.status = refused ? "blocked" : "off"; live.error = err?.name || "failed"; notify();
    if (!refused) scheduleRetry();
  }
  return live.status;
}

// The phone took the microphone away (the camera opened, a call came in): try again every few seconds while the app is visible.
function lost(why) {
  if (live.status !== "on") return;
  teardown();
  live.status = "off"; live.error = why; notify();
  scheduleRetry();
}
function scheduleRetry() {
  if (live.retry) return;
  live.retry = setTimeout(() => { live.retry = null; if (earWanted() && awake && !cameraOpen() && document.visibilityState === "visible" && live.status !== "on") startEar().then((s) => { if (s !== "on" && s !== "blocked") scheduleRetry(); }); }, 3000);
}

export function stopEar() { startGen++; teardown(); live.status = "off"; live.level = 0; notify(); }

// While Biscuit speaks the microphone is given back to the phone. With a capture open, an iPhone routes playback to the
// quiet earpiece instead of the loudspeaker; closing the stream for the length of his sentence puts his voice back where
// Rosa can hear it, and he cannot hear himself at all. The stream reopens the moment he is done.
let held = false;
/** True when the ear was open (or opening) and is now held for the length of Biscuit's sentence. */
export function holdEar() {
  if (live.status !== "on" && live.status !== "starting") return false;
  if (earMode() === "recognition") return false;
  held = true; startGen++; teardown(); live.status = "held"; live.level = 0; notify();
  return true;
}
export async function unholdEar() {
  if (!held) return;
  held = false;
  if (live.status === "held") { live.status = "off"; earCheck(); }
}
export function pauseEar() { store.set({ earPaused: true }); held = false; stopEar(); live.status = "paused"; notify(); }
export function resumeEar() { store.set({ earPaused: false }); return startEar(); }
/** Rosa's tap on Let Me Hear: her yes to the ear on this phone, and the gesture the phone may need to open the microphone. */
export function allowEar() { store.set({ earPaused: false, earAllowedAt: store.get().earAllowedAt || new Date().toISOString() }); live.status = "off"; live.error = null; awake = true; return startEar(); }
export const earRunning = () => live.status === "on";

/** One answer through the phone's recognizer when the ear is not open (setup, asleep): the first words, or quiet after maxMs. */
export function hearOnce({ maxMs = 6000 } = {}) {
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  return new Promise((resolve) => {
    let done = false;
    const finish = (v) => { if (done) return; done = true; clearTimeout(timer); try { r.abort(); } catch { /* gone */ } resolve(v); };
    const r = new SR();
    r.continuous = false; r.interimResults = false; r.maxAlternatives = 1; r.lang = store.get().household?.language === "es" ? "es-US" : "en-US";
    const timer = setTimeout(() => finish({ blob: null, ms: 0, spoke: false }), maxMs);
    r.onresult = (e) => { const text = String(e.results?.[0]?.[0]?.transcript || "").trim(); finish(text ? { blob: { text }, ms: 0, spoke: true } : { blob: null, ms: 0, spoke: false }); };
    r.onerror = (e) => { diag("recognition once", e?.error || "error"); finish({ blob: null, ms: 0, spoke: false }); };
    r.onend = () => finish({ blob: null, ms: 0, spoke: false });
    try { r.start(); } catch (err) { diag("recognition once", err?.name || "failed"); finish({ blob: null, ms: 0, spoke: false }); }
  });
}
export const hasRecognizer = () => typeof window !== "undefined" && Boolean(window.SpeechRecognition || window.webkitSpeechRecognition);

/** A screen's turn to hear: the next utterance, else quiet after maxMs. The onLevel callback follows the sound meter. */
export function hearNext({ maxMs = 6000, onLevel } = {}) {
  let unsub = null;
  if (onLevel) { unsub = subscribeEar(() => onLevel(live.level)); }
  return core.next({ maxMs }).finally(() => { if (unsub) unsub(); });
}
/** A screen that was waiting on the ear is leaving: the wait ends, and the next words go where they should. */
export function releaseEar() { core.release(); }

let wired = false;
// After a reload the phone plays no sound until it has been tapped once, so hearing Rosa before that tap would only
// produce silent answers: the ear sleeps until the first tap anywhere (speech.js's primeSpeech calls wakeEar).
let awake = true;
export const earAwake = () => awake;
export function wakeEar() { awake = true; earCheck(); }
// While the letter camera is open the ear steps aside: on an iPhone a microphone opening and closing beside a camera
// capture leaves the sound routed wrong for the rest of the visit. The camera page speaks its own guidance.
const cameraOpen = () => typeof window !== "undefined" && window.location.pathname === "/letter";

/** Opens or closes the ear to match what is wanted right now; safe to call often (each screen change, each store change). */
export function earCheck() {
  if (typeof document === "undefined") return;
  if (!earWanted()) {
    if (live.status === "on" || live.status === "starting") stopEar();
    if (store.get().earPaused && live.status !== "paused") { live.status = "paused"; notify(); }
    return;
  }
  if (!awake) { if (live.status === "on" || live.status === "starting") stopEar(); if (live.status !== "asleep") { live.status = "asleep"; notify(); } return; }
  if (cameraOpen()) { if (live.status === "on" || live.status === "starting") stopEar(); if (live.status !== "looking") { live.status = "looking"; notify(); } return; }
  if (live.status === "asleep" || live.status === "looking") live.status = "off";
  // Settings changed how he hears: start over the new way.
  if ((live.status === "on" || live.status === "starting") && live.mode && live.mode !== earMode()) stopEar();
  if (document.visibilityState === "visible" && live.status !== "on" && live.status !== "starting" && live.status !== "blocked" && live.status !== "held") startEar();
}
/** Keeps the ear open whenever it is wanted and the app is visible; closes it while the app is hidden. Idempotent. */
export function keepEarOpen() {
  if (wired || typeof document === "undefined") return;
  wired = true;
  document.addEventListener("visibilitychange", () => { if (document.visibilityState === "hidden") { if (live.status === "on") stopEar(); } else earCheck(); });
  store.subscribe?.(earCheck);
  earCheck();
}
