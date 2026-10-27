import { downsample, encodeWav, isSilent } from "./audio.js";
import { store } from "./store.js";

let current = [];

export function stopSpeaking() {
  current = [];
  if ("speechSynthesis" in window) window.speechSynthesis.cancel();
}

/** Speaks the lines in order with the phone's own voice; resolves when the last one ends. */
export function speak(lines, { rate = 0.9 } = {}) {
  if (!("speechSynthesis" in window) || !lines.length) return Promise.resolve();
  stopSpeaking();
  const volume = Math.min(1, 0.8 + 0.1 * (store.get().volumeStep || 0));
  return new Promise((resolve) => {
    current = lines.map((text) => {
      const u = new SpeechSynthesisUtterance(text);
      u.rate = rate; u.volume = volume; u.lang = "en-US";
      return u;
    });
    const last = current[current.length - 1];
    last.onend = () => resolve();
    last.onerror = () => resolve();
    current.forEach((u) => window.speechSynthesis.speak(u));
  });
}

/** Records until 1.2 s of silence after speech began, or 6 s; returns a 16 kHz mono WAV blob. */
export async function listen({ maxMs = 6000, silenceMs = 1200, onLevel } = {}) {
  const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
  const Ctx = window.AudioContext || window.webkitAudioContext;
  const ctx = new Ctx();
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
