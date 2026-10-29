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

/**
 * The cadence, in one place. The phone samples every 500 ms and needs two samples in a row over the threshold; after
 * a send, a cooldown. The cooldown is 5 seconds to start and after a send that saw something (carriers are fast), and
 * backs off while sends see nothing: 5, then 15, 30, 60 seconds, so a windy day cannot burn the SAM cap in minutes.
 * Two quiet minutes bring it back to 5 seconds. The household's motion gate from Ana's taps sets the threshold on top.
 */
export const COOLDOWN_MS = [5_000, 15_000, 30_000, 60_000];
export const QUIET_RESET_MS = 120_000;

/** Motion: the mean absolute difference is at or above the threshold on two consecutive samples; then a cooldown. */
export class MotionDetector {
  /** `cooldownMs` fixes a single cooldown (the envelope test uses one); otherwise the cooldown steps through `steps`. */
  constructor({ threshold = 12, consecutive = 2, cooldownMs = null, steps = COOLDOWN_MS, quietResetMs = QUIET_RESET_MS } = {}) {
    this.threshold = threshold; this.consecutive = consecutive;
    this.steps = cooldownMs === null || cooldownMs === undefined ? steps : [cooldownMs];
    this.quietResetMs = quietResetMs;
    this.step = 0; this.activeCooldownMs = this.steps[0];
    this.prev = null; this.streak = 0; this.lastSentAt = -Infinity; this.lastActiveAt = -Infinity; this.lastDiff = 0;
  }
  /** The cooldown the next send gets. */
  get cooldownMs() { return this.steps[this.step]; }
  sample(gray, now) {
    const diff = this.prev ? meanAbsDiff(gray, this.prev) : 0;
    this.prev = gray; this.lastDiff = diff;
    const active = diff >= this.threshold;
    if (active) this.lastActiveAt = now;
    else if (this.step > 0 && now - this.lastActiveAt >= this.quietResetMs) this.step = 0;
    this.streak = active ? this.streak + 1 : 0;
    if (active && now - this.lastSentAt < this.activeCooldownMs) return "cooldown";
    if (this.streak < this.consecutive) return "idle";
    this.streak = 0;
    this.lastSentAt = now;
    this.activeCooldownMs = this.steps[this.step];
    return "motion";
  }
  /** What the send found: a sighting brings the cooldown in force back to the first step at once; nothing seen backs the next one off. */
  outcome(seen) {
    if (seen) { this.step = 0; this.activeCooldownMs = this.steps[0]; }
    else this.step = Math.min(this.step + 1, this.steps.length - 1);
  }
}
