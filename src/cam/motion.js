// On-phone motion detection for the watched region. Nothing leaves the phone from here.

/** Grey values of the region, sampled to outW pixels wide. data is RGBA for a width x height frame. */
export function toGray(data, width, height, region, outW = 160) {
  const rx = Math.floor(region.x * width), ry = Math.floor(region.y * height);
  const rw = Math.max(1, Math.floor(region.w * width)), rh = Math.max(1, Math.floor(region.h * height));
  const outH = Math.max(1, Math.round((rh / rw) * outW));
  const out = new Uint8Array(outW * outH);
  for (let oy = 0; oy < outH; oy++) {
    const sy = ry + Math.floor((oy / outH) * rh);
    for (let ox = 0; ox < outW; ox++) {
      const sx = rx + Math.floor((ox / outW) * rw);
      const i = (sy * width + sx) * 4;
      out[oy * outW + ox] = (data[i] * 299 + data[i + 1] * 587 + data[i + 2] * 114) / 1000;
    }
  }
  return out;
}

export function meanAbsDiff(a, b) {
  const n = Math.min(a.length, b.length);
  if (!n) return 0;
  let sum = 0;
  for (let i = 0; i < n; i++) sum += Math.abs(a[i] - b[i]);
  return sum / n;
}

/** Motion: the mean absolute difference is at or above the threshold on two consecutive samples; then a cooldown. */
export class MotionDetector {
  constructor({ threshold = 12, consecutive = 2, cooldownMs = 90_000 } = {}) {
    this.threshold = threshold; this.consecutive = consecutive; this.cooldownMs = cooldownMs;
    this.prev = null; this.streak = 0; this.lastSentAt = -Infinity; this.lastDiff = 0;
  }
  sample(gray, now) {
    const diff = this.prev ? meanAbsDiff(gray, this.prev) : 0;
    this.prev = gray; this.lastDiff = diff;
    this.streak = diff >= this.threshold ? this.streak + 1 : 0;
    if (diff >= this.threshold && now - this.lastSentAt < this.cooldownMs) return "cooldown";
    if (this.streak < this.consecutive) return "idle";
    this.streak = 0;
    this.lastSentAt = now;
    return "motion";
  }
}
