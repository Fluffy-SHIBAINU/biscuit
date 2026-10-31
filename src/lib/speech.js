import { downsample, encodeWav, isSilent } from "./audio.js";
import { store } from "./store.js";
import { pickVoice, sentences } from "./voice.js";
import { core as ear, earRunning, hearNext, holdEar, unholdEar } from "./ear.js";
import { talkState } from "./talkState.js";

let current = [];
let currentAudio = null;
// One player for Biscuit's neural voice, unlocked by the first tap (iPhones play only an element that a gesture has started
// once; a fresh element per line stays silent). Every line is played through this one.
const SILENT_WAV = "data:audio/wav;base64," + (typeof btoa === "function" ? btoa(String.fromCharCode(...new Uint8Array(encodeWav(new Float32Array(800), 8000)))) : "");
let player = null;
let playerUnlocked = false;
// The surest way to play a clip on an iPhone without a tap each time: an AudioContext that a tap once resumed, playing
// decoded buffers. The audio element is the second way, the phone's own voice the third.
let voiceCtx = null;
let currentSource = null;
function theVoiceCtx() {
  const Ctx = typeof window !== "undefined" && (window.AudioContext || window.webkitAudioContext);
  if (!Ctx) return null;
  if (!voiceCtx || voiceCtx.state === "closed") voiceCtx = new Ctx();
  return voiceCtx;
}
function thePlayer() {
  if (!player && typeof Audio !== "undefined") { player = new Audio(); player.setAttribute("playsinline", ""); player.preload = "auto"; }
  return player;
}

export function stopSpeaking() {
  stoppedAt = Date.now();
  current = [];
  if (currentAudio) { try { currentAudio.pause(); } catch { /* already stopped */ } currentAudio = null; }
  if (currentSource) { try { currentSource.stop(); } catch { /* already stopped */ } currentSource = null; }
  if ("speechSynthesis" in window) window.speechSynthesis.cancel();
}

/** The phone's voices, once they have loaded (some phones hand them over late). */
export function voicesReady(waitMs = 600) {
  if (!("speechSynthesis" in window)) return Promise.resolve([]);
  const have = window.speechSynthesis.getVoices();
  if (have.length) return Promise.resolve(have);
  return new Promise((resolve) => {
    const done = () => { window.speechSynthesis.onvoiceschanged = null; resolve(window.speechSynthesis.getVoices()); };
    window.speechSynthesis.onvoiceschanged = done;
    setTimeout(done, waitMs);
  });
}

/**
 * Phones refuse to speak (and to play audio) until the page has been tapped once; some forget after a reload. The first
 * tap anywhere in the app spends itself on a silent utterance and a silent note, which unlocks Biscuit's voice for the
 * rest of the visit. Harmless when the phone needed no unlocking.
 */
let primed = false;
export function primeSpeech() {
  if (primed) return;
  primed = true;
  try {
    if ("speechSynthesis" in window) { const u = new SpeechSynthesisUtterance("."); u.volume = 0; u.rate = 2; window.speechSynthesis.speak(u); }
    const a = thePlayer();
    if (a) { a.src = SILENT_WAV; a.volume = 0; a.play().then(() => { playerUnlocked = true; }).catch(() => {}); }
    const ctx = theVoiceCtx();
    if (ctx) { ctx.resume().catch(() => {}); const src = ctx.createBufferSource(); src.buffer = ctx.createBuffer(1, 1, ctx.sampleRate); src.connect(ctx.destination); src.start(0); }
  } catch { /* nothing to unlock */ }
  if (talkState.get().speechBlocked) talkState.set({ speechBlocked: false });
}
if (typeof document !== "undefined") document.addEventListener("pointerdown", primeSpeech, { capture: true, once: true });

/** Speaks with the phone's own voice: the best English voice it has (or the one chosen in Settings), a sentence at a time, at talking pace. */
async function speakDevice(lines, { rate = 1.0 } = {}) {
  if (!("speechSynthesis" in window) || !lines.length) return;
  const volume = Math.min(1, 0.8 + 0.1 * (store.get().volumeStep || 0));
  const voice = pickVoice(await voicesReady(), { name: store.get().voiceName || null });
  const pieces = lines.flatMap((l) => sentences(l));
  if (!pieces.length) return;
  await new Promise((resolve) => {
    const guard = setTimeout(resolve, 5000 + pieces.join(" ").length * 90);
    // A phone that has had no tap yet refuses to speak: Chrome says "not-allowed" at once, Safari says nothing. Either way the
    // bar shows what he wanted to say with a button, and that tap unlocks the voice for the rest of the visit.
    let started = false;
    const blocked = () => { if (started) return; talkState.set({ speechBlocked: true }); try { window.speechSynthesis.cancel(); } catch { /* nothing queued */ } clearTimeout(guard); clearTimeout(silent); resolve(); };
    const silent = setTimeout(() => { if (!started && !window.speechSynthesis.speaking) blocked(); }, 4000);
    const done = () => { clearTimeout(guard); clearTimeout(silent); resolve(); };
    current = pieces.map((text) => {
      const u = new SpeechSynthesisUtterance(text);
      u.rate = rate; u.volume = volume; u.pitch = 1.0; u.lang = voice?.lang || "en-US";
      if (voice) u.voice = voice;
      return u;
    });
    const last = current[current.length - 1];
    current.forEach((u) => { u.onstart = () => { started = true; if (talkState.get().speechBlocked) talkState.set({ speechBlocked: false }); }; });
    last.onend = done;
    last.onerror = (e) => (e?.error === "not-allowed" ? blocked() : done());
    current[0].onerror = (e) => { if (e?.error === "not-allowed") blocked(); else if (current.length === 1) done(); };
    current.forEach((u) => window.speechSynthesis.speak(u));
  });
}

/** One line's audio from Biscuit's neural voice on the server; throws when there is none or it fails, and the device voice takes over. */
async function fetchLine(text) {
  const token = store.get().deviceToken;
  const res = await fetch("/api/biscuit/speak", { method: "POST", headers: { authorization: `Bearer ${token}`, "content-type": "application/json" }, body: JSON.stringify({ text }) });
  if (!res.ok) throw new Error(`speak ${res.status}`);
  return res.blob();
}

/** Plays one clip through the voice AudioContext. Resolves false when the context is not running or the clip will not decode. */
async function playBuffer(blob) {
  const ctx = theVoiceCtx();
  if (!ctx) return false;
  if (ctx.state !== "running") { await ctx.resume().catch(() => {}); if (ctx.state !== "running") return false; }
  let buffer;
  try { buffer = await ctx.decodeAudioData(await blob.arrayBuffer()); } catch { return false; }
  return new Promise((resolve) => {
    const src = ctx.createBufferSource();
    src.buffer = buffer;
    const gain = ctx.createGain();
    gain.gain.value = Math.min(1, 0.8 + 0.1 * (store.get().volumeStep || 0));
    src.connect(gain); gain.connect(ctx.destination);
    currentSource = src;
    src.onended = () => { if (currentSource === src) currentSource = null; resolve(true); };
    try { src.start(0); } catch { currentSource = null; resolve(false); }
  });
}

/** Plays one line through the shared audio element. Resolves false when the phone refused to play. */
function playUrl(blob) {
  const url = URL.createObjectURL(blob);
  return new Promise((resolve) => {
    const a = thePlayer();
    if (!a) { URL.revokeObjectURL(url); resolve(false); return; }
    currentAudio = a;
    let started = false;
    const finish = (ok) => { if (currentAudio === a) currentAudio = null; a.onended = a.onerror = a.onpause = a.onplaying = null; URL.revokeObjectURL(url); resolve(ok); };
    a.onplaying = () => { started = true; playerUnlocked = true; };
    a.onended = () => finish(true);
    a.onerror = () => finish(started);
    a.onpause = () => { if (started) finish(true); };
    a.volume = Math.min(1, 0.8 + 0.1 * (store.get().volumeStep || 0));
    a.src = url;
    a.play().catch(() => finish(false));
  });
}

/** Speaks with the neural voice, fetching the next line while the current one plays; a failure hands the rest to the device voice. */
async function speakNeural(lines, opts) {
  let next = fetchLine(lines[0]);
  for (let i = 0; i < lines.length; i++) {
    let blob;
    try { blob = await next; } catch { await speakDevice(lines.slice(i), opts); return; }
    if (i + 1 < lines.length) next = fetchLine(lines[i + 1]);
    if (stoppedAt > startedAt) return;
    // The context first (an iPhone plays it without a tap once a tap has woken it), the audio element second.
    let played = await playBuffer(blob);
    if (stoppedAt > startedAt) return;
    if (!played) played = await playUrl(blob);
    if (stoppedAt > startedAt) return;
    // The phone would not play the clip (no tap yet): the device voice says this line and the rest, and the bar offers the tap.
    if (!played) { talkState.set({ speechBlocked: !playerUnlocked }); await speakDevice(lines.slice(i), opts); return; }
  }
}

let startedAt = 0, stoppedAt = 0;

/** Speaks the lines in order; resolves when the last one ends. The neural voice when the server has one, else the phone's own. */
export function speak(lines, opts = {}) {
  if (!lines.length) return Promise.resolve();
  stopSpeaking();
  startedAt = Date.now();
  // The ear is closed while Biscuit talks, so he never answers himself. Only the newest speech may open it again: one that
  // was cut short by this one settles later, and must not unmute the ear under it.
  const id = ++speakSeq;
  ear.mute(true);
  // When the microphone was just closed, the phone needs a moment to move from recording to playback before the first sound,
  // or a quick (cached) line comes out of the earpiece or not at all.
  const settle = holdEar() ? new Promise((r) => setTimeout(r, SETTLE_MS)) : Promise.resolve();
  const done = settle.then(() => (stoppedAt > startedAt ? undefined : store.get().neuralVoice ? speakNeural(lines, opts) : speakDevice(lines, opts)));
  return done.finally(() => { if (id === speakSeq) { ear.mute(false); unholdEar(); } });
}
const SETTLE_MS = 350;
let speakSeq = 0;

const _stop = stopSpeaking;
export { _stop as stopAllSpeech };

/**
 * The next thing Rosa says, as a 16 kHz mono WAV blob: from the open ear when it is listening, else a one-off recording that
 * ends at 1.2 s of silence after speech began, or at maxMs. `spoke` is false when nothing was said.
 */
export async function listen({ maxMs = 6000, silenceMs = 1200, onLevel } = {}) {
  if (earRunning()) return hearNext({ maxMs, onLevel });
  // Paused means paused: no screen opens the microphone on its own once Rosa has agreed to the ear and then closed it.
  const st = store.get();
  if (st.consentedAt && st.earPaused) return { blob: null, ms: 0, spoke: false };
  const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
  const Ctx = window.AudioContext || window.webkitAudioContext;
  const ctx = new Ctx();
  if (ctx.state === "suspended") await ctx.resume().catch(() => {});
  const source = ctx.createMediaStreamSource(stream);
  const node = ctx.createScriptProcessor(4096, 1, 1);
  const chunks = [];
  let spoke = false;
  let quietSince = null;
  const started = Date.now();
  const done = new Promise((resolve) => {
    node.onaudioprocess = (e) => {
      const data = new Float32Array(e.inputBuffer.getChannelData(0));
      chunks.push(data);
      const quiet = isSilent(data);
      if (onLevel) onLevel(quiet ? 0 : 1);
      const now = Date.now();
      if (!quiet) { spoke = true; quietSince = null; }
      else if (spoke && quietSince === null) quietSince = now;
      if ((spoke && quietSince !== null && now - quietSince >= silenceMs) || now - started >= maxMs) resolve();
    };
  });
  source.connect(node);
  node.connect(ctx.destination);
  await done;
  node.disconnect(); source.disconnect();
  stream.getTracks().forEach((t) => t.stop());
  const total = chunks.reduce((n, c) => n + c.length, 0);
  const all = new Float32Array(total);
  let o = 0;
  for (const c of chunks) { all.set(c, o); o += c.length; }
  const wav = encodeWav(downsample(all, ctx.sampleRate, 16000), 16000);
  await ctx.close();
  return { blob: new Blob([wav], { type: "audio/wav" }), ms: Date.now() - started, spoke };
}

export function saidStop(text) {
  return /\bstop\b/i.test(text || "");
}

/** Keeps a spoken line for Ana's page (never Rosa's words), when letters are shared. */
export function keep(text) {
  const st = store.get();
  if (!st.deviceToken || st.household?.shareLetters === false || !text) return;
  fetch("/api/biscuit/events", { method: "POST", headers: { authorization: `Bearer ${st.deviceToken}`, "content-type": "application/json" }, body: JSON.stringify({ kind: "said", data: { text: String(text).slice(0, 300) } }) }).catch(() => {});
}

export function speakAndKeep(lines, opts) {
  keep(lines.join(" "));
  return speak(lines, opts);
}
