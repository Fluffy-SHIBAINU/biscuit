import { MotionDetector, toGray } from "./motion.js";

/** The phone's default motion gate, the same as the detector's; the household's own gate (learned from Ana's taps) replaces it. */
export const DEFAULT_GATE = 12;
/** A clip: eight small crops of the box over six seconds, each under about 60 KB. */
export const CLIP_FRAMES = 8;
export const CLIP_SPAN_MS = 6000;
export const CLIP_WIDTH = 320;
export const CLIP_MAX_BYTES = 60_000;

/** Draws the region crop of the video into a canvas; returns the canvas. */
export function cropRegion(video, region, outW) {
  const vw = video.videoWidth || 1280, vh = video.videoHeight || 960;
  const sx = region.x * vw, sy = region.y * vh, sw = Math.max(1, region.w * vw), sh = Math.max(1, region.h * vh);
  const canvas = document.createElement("canvas");
  canvas.width = outW; canvas.height = Math.max(1, Math.round((sh / sw) * outW));
  canvas.getContext("2d").drawImage(video, sx, sy, sw, sh, 0, 0, canvas.width, canvas.height);
  return canvas;
}

export async function cropJpeg(video, region, outW = 640, maxBytes = 300_000) {
  const canvas = cropRegion(video, region, outW);
  for (let q = 0.85; q >= 0.3; q -= 0.15) {
    const blob = await new Promise((r) => canvas.toBlob(r, "image/jpeg", q));
    if (blob && blob.size <= maxBytes) return blob;
  }
  return new Promise((r) => canvas.toBlob(r, "image/jpeg", 0.3));
}

/** Whether frames may leave the phone right now: not paused, and not below 10 percent battery while unplugged. */
export function shouldSend({ paused = false, battery = null, charging = null } = {}) {
  if (paused) return false;
  if (battery !== null && battery !== undefined && !charging && battery < 10) return false;
  return true;
}

/** The extra fields a send carries: the motion level that tripped the gate (Ana's taps tune the gate from it), and the collect flag in collect mode. */
export function frameFields(collect, detector) {
  const level = detector && Number.isFinite(detector.lastDiff) ? detector.lastDiff : null;
  return { ...(collect ? { collect: "1" } : {}), ...(level === null ? {} : { level: level.toFixed(1) }) };
}

/** The motion threshold from the household's gate; anything but a positive number means the default. Returns the threshold. */
export function applyGate(detector, gate) {
  const threshold = typeof gate === "number" && Number.isFinite(gate) && gate > 0 ? gate : DEFAULT_GATE;
  if (detector) detector.threshold = threshold;
  return threshold;
}

/** Tells the detector what a send found (the frames reply, or nothing when the send failed or was skipped); returns whether something was seen. */
export function noteOutcome(detector, result) {
  const seen = Boolean(result && typeof result === "object" && result.seen);
  if (detector) detector.outcome(seen);
  return seen;
}

/** count grabs, gapMs apart, in order. */
export async function captureBurst(grab, count, gapMs) {
  const frames = [];
  for (let i = 0; i < count; i++) {
    frames.push(await grab());
    if (i < count - 1) await new Promise((r) => setTimeout(r, gapMs));
  }
  return frames;
}

/**
 * Samples the region every 500 ms; on motion grabs three crops 500 ms apart and hands them to onFrames with the motion
 * level; what onFrames resolves to (the frames reply) sets the detector's cooldown (motion.js: 5 s after a sighting, backing off
 * while sends see nothing). When `clip()` says the household keeps clips, it also grabs eight small crops over six seconds and hands them
 * to onClip once complete, so the chime never waits for the clip. Returns a stop function.
 */
export function startWatcher(video, region, { onFrames, onClip, clip, onLevel, isPaused, detector = new MotionDetector(), intervalMs = 500 } = {}) {
  let busy = false;
  let stopped = false;
  const timer = setInterval(async () => {
    if (stopped || busy || !video.videoWidth) return;
    const small = cropRegion(video, region, 160);
    const ctx = small.getContext("2d");
    const gray = toGray(ctx.getImageData(0, 0, small.width, small.height).data, small.width, small.height, { x: 0, y: 0, w: 1, h: 1 }, 160);
    const state = detector.sample(gray, Date.now());
    if (onLevel) onLevel(state, detector.lastDiff, detector.threshold);
    if (state !== "motion") return;
    if (isPaused && isPaused()) return;
    busy = true;
    const level = detector.lastDiff;
    try {
      const detection = captureBurst(() => cropJpeg(video, region), 3, 500).then((frames) => onFrames(frames, { level })).then((r) => noteOutcome(detector, r), () => noteOutcome(detector, undefined));
      const clipping = onClip && clip && clip()
        ? captureBurst(() => cropJpeg(video, region, CLIP_WIDTH, CLIP_MAX_BYTES), CLIP_FRAMES, Math.round(CLIP_SPAN_MS / (CLIP_FRAMES - 1))).then((frames) => onClip(frames, { level }))
        : null;
      await Promise.allSettled([detection, clipping]);
    } finally { busy = false; }
  }, intervalMs);
  return () => { stopped = true; clearInterval(timer); };
}

/**
 * The last resort when reopening the camera does not bring the frames back: the page reloads itself, after this many
 * frozen heartbeats in a row, and never more than once in this many milliseconds, so a camera that is truly gone cannot
 * make the phone reload forever. The time of the last reload lives in localStorage so it survives the reload.
 */
export const RELOAD_AFTER_BEATS = 2;
export const RELOAD_GAP_MS = 600_000;
export const RELOAD_KEY = "biscuit_cam_reload_at";

export function shouldReload({ frozenBeats, lastReloadAt, now }) {
  if (frozenBeats < RELOAD_AFTER_BEATS) return false;
  return lastReloadAt == null || now - lastReloadAt >= RELOAD_GAP_MS;
}

export function readReloadAt(storage = globalThis.localStorage) {
  try { const v = Number(storage?.getItem(RELOAD_KEY)); return Number.isFinite(v) && v > 0 ? v : null; } catch { return null; }
}

export function writeReloadAt(now, storage = globalThis.localStorage) {
  try { storage?.setItem(RELOAD_KEY, String(now)); } catch { /* the gap is then not remembered; the two-beat rule still holds */ }
}
