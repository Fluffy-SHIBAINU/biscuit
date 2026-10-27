/** Hold-to-fire for the Help button: pointerdown starts the clock, letting go before `ms` cancels. Returns the unbind function. */
export function holdToHelp(el, onFire, ms = 2000, onProgress) {
  let timer = null;
  let started = 0;
  let raf = null;
  const tick = () => { if (onProgress && timer) { onProgress(Math.min(1, (Date.now() - started) / ms)); raf = requestAnimationFrame(tick); } };
  const down = (e) => {
    e?.preventDefault?.();
    started = Date.now();
    clearTimeout(timer);
    timer = setTimeout(() => { timer = null; if (onProgress) onProgress(1); onFire(); }, ms);
    if (onProgress && typeof requestAnimationFrame === "function") raf = requestAnimationFrame(tick);
  };
  const cancel = () => { clearTimeout(timer); timer = null; if (raf && typeof cancelAnimationFrame === "function") cancelAnimationFrame(raf); if (onProgress) onProgress(0); };
  el.addEventListener("pointerdown", down);
  el.addEventListener("pointerup", cancel);
  el.addEventListener("pointercancel", cancel);
  el.addEventListener("pointerleave", cancel);
  return () => { cancel(); el.removeEventListener("pointerdown", down); el.removeEventListener("pointerup", cancel); el.removeEventListener("pointercancel", cancel); el.removeEventListener("pointerleave", cancel); };
}
