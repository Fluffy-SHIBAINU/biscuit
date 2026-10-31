import { downsample, encodeWav, isSilent } from "./audio.js";
import { store } from "./store.js";
import { pickVoice, sentences } from "./voice.js";
import { core as ear, earRunning, hearNext } from "./ear.js";
import { talkState } from "./talkState.js";

let current = [];
let currentAudio = null;

export function stopSpeaking() {
  stoppedAt = Date.now();
  current = [];
  if (currentAudio) { try { currentAudio.pause(); } catch { /* already stopped */ } currentAudio = null; }
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

/** Speaks with the phone's own voice: the best English voice it has (or the one chosen in Settings), a sentence at a time, at talking pace. */
async function speakDevice(lines, { rate = 1.0 } = {}) {
  if (!("speechSynthesis" in window) || !lines.length) return;
  const volume = Math.min(1, 0.8 + 0.1 * (store.get().volumeStep || 0));
  const voice = pickVoice(await voicesReady(), { name: store.get().voiceName || null });
  const pieces = lines.flatMap((l) => sentences(l));
  if (!pieces.length) return;
  await new Promise((resolve) => {
    const guard = setTimeout(resolve, 5000 + pieces.join(" ").length * 90);
    // A phone that has had no tap yet may refuse to speak at all: after 1.5 s with no sound, say so on the bar, which offers a tap.
    let started = false;
    const silent = setTimeout(() => { if (!started && !window.speechSynthesis.speaking) { talkState.set({ speechBlocked: true }); clearTimeout(guard); resolve(); } }, 1500);
    const done = () => { clearTimeout(guard); clearTimeout(silent); resolve(); };
    current = pieces.map((text) => {
      const u = new SpeechSynthesisUtterance(text);
      u.rate = rate; u.volume = volume; u.pitch = 1.0; u.lang = voice?.lang || "en-US";
      if (voice) u.voice = voice;
      return u;
    });
    const last = current[current.length - 1];
    current[0].onstart = () => { started = true; if (talkState.get().speechBlocked) talkState.set({ speechBlocked: false }); };
    last.onend = done;
    last.onerror = done;
    current.forEach((u) => window.speechSynthesis.speak(u));
  });
}

/** One line's audio from Biscuit's neural voice on the server; throws when there is none or it fails, and the device voice takes over. */
async function fetchLine(text) {
  const token = store.get().deviceToken;
  const res = await fetch("/api/biscuit/speak", { method: "POST", headers: { authorization: `Bearer ${token}`, "content-type": "application/json" }, body: JSON.stringify({ text }) });
  if (!res.ok) throw new Error(`speak ${res.status}`);
  return URL.createObjectURL(await res.blob());
}

function playUrl(url) {
  return new Promise((resolve) => {
    const a = new Audio(url);
    currentAudio = a;
    const volume = Math.min(1, 0.8 + 0.1 * (store.get().volumeStep || 0));
    a.volume = volume;
    const done = () => { if (currentAudio === a) currentAudio = null; URL.revokeObjectURL(url); resolve(); };
    a.onended = done; a.onerror = done; a.onpause = done;
    a.play().catch(done);
  });
}

/** Speaks with the neural voice, fetching the next line while the current one plays; a failure hands the rest to the device voice. */
async function speakNeural(lines, opts) {
  let next = fetchLine(lines[0]);
  for (let i = 0; i < lines.length; i++) {
    let url;
    try { url = await next; } catch { await speakDevice(lines.slice(i), opts); return; }
    if (i + 1 < lines.length) next = fetchLine(lines[i + 1]);
    if (!current.length && !currentAudio && i > 0 && stoppedAt > startedAt) return;
    await playUrl(url);
    if (stoppedAt > startedAt) return;
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
  const done = store.get().neuralVoice ? speakNeural(lines, opts) : speakDevice(lines, opts);
  return done.finally(() => { if (id === speakSeq) ear.mute(false); });
}
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
