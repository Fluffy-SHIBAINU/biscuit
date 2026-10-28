import { MotionDetector, toGray } from "./motion.js";

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

/** The extra fields a send carries in collect mode: the flag and the motion level that tripped the gate. Nothing otherwise. */
export function frameFields(collect, detector) {
  if (!collect) return {};
  const level = detector && Number.isFinite(detector.lastDiff) ? detector.lastDiff : null;
  return level === null ? { collect: "1" } : { collect: "1", level: level.toFixed(1) };
}

/** Samples the region every 500 ms; on motion grabs three crops 500 ms apart and hands them to onFrames with the motion level. Returns a stop function. */
export function startWatcher(video, region, { onFrames, onLevel, isPaused, detector = new MotionDetector(), intervalMs = 500 } = {}) {
  let busy = false;
  let stopped = false;
  const timer = setInterval(async () => {
    if (stopped || busy || !video.videoWidth) return;
    const small = cropRegion(video, region, 160);
    const ctx = small.getContext("2d");
    const gray = toGray(ctx.getImageData(0, 0, small.width, small.height).data, small.width, small.height, { x: 0, y: 0, w: 1, h: 1 }, 160);
    const state = detector.sample(gray, Date.now());
    if (onLevel) onLevel(state);
    if (state !== "motion") return;
    if (isPaused && isPaused()) return;
    busy = true;
    const level = detector.lastDiff;
    try {
      const frames = [];
      for (let i = 0; i < 3; i++) {
        frames.push(await cropJpeg(video, region));
        if (i < 2) await new Promise((r) => setTimeout(r, 500));
      }
      await onFrames(frames, { level });
    } finally { busy = false; }
  }, intervalMs);
  return () => { stopped = true; clearInterval(timer); };
}
