/**
 * Hold-to-fire for the Help button. pointerdown starts the clock; after `ms` the hold is armed (onArmed); the release
 * then fires onFire inside the pointerup handler, so a tel: navigation has the user's gesture. Letting go early cancels.
 */
export function holdToHelp(el, onFire, ms = 2000, onProgress, onArmed) {
  let timer = null;
  let armed = false;
  let started = 0;
  let raf = null;
  const tick = () => { if (onProgress && timer) { onProgress(Math.min(1, (Date.now() - started) / ms)); raf = requestAnimationFrame(tick); } };
  const reset = () => { clearTimeout(timer); timer = null; armed = false; if (raf && typeof cancelAnimationFrame === "function") cancelAnimationFrame(raf); if (onProgress) onProgress(0); };
  const down = (e) => {
    e?.preventDefault?.();
    reset();
    started = Date.now();
    timer = setTimeout(() => { timer = null; armed = true; if (onProgress) onProgress(1); if (onArmed) onArmed(); }, ms);
    if (onProgress && typeof requestAnimationFrame === "function") raf = requestAnimationFrame(tick);
  };
  const up = () => { const fire = armed; reset(); if (fire) onFire(); };
  el.addEventListener("pointerdown", down);
  el.addEventListener("pointerup", up);
  el.addEventListener("pointercancel", reset);
  el.addEventListener("pointerleave", reset);
  return () => { reset(); el.removeEventListener("pointerdown", down); el.removeEventListener("pointerup", up); el.removeEventListener("pointercancel", reset); el.removeEventListener("pointerleave", reset); };
}
