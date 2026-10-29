// A synthetic letter as it reaches the reader: three families. "photo": a tilted page on a tabletop under uneven light,
// slightly soft, with sensor noise and two folds. "scan": a flatbed scan, grey, a little skewed, with dust. "fax": a
// low-contrast monospace copy with banding. Pure: the same letter, seed and family give the same page.
import { mulberry32 } from "./rng.js";
import type { Synth } from "./letters.js";

export type Frame = { w: number; h: number };
export const FAMILIES = ["photo", "scan", "fax"] as const;
export type Family = (typeof FAMILIES)[number];
const PAGE_W = 816, PAGE_H = 1056; // 8.5 by 11 inches at 96 dpi

const TABLES = [
  "repeating-linear-gradient(97deg, #7a4a22 0 14px, #8d5a2d 14px 31px, #6e4320 31px 42px)",
  "repeating-linear-gradient(92deg, #a8773f 0 22px, #b9895a 22px 40px, #9c6c38 40px 55px)",
  "radial-gradient(ellipse at 40% 30%, #3a3a3f, #1f1f23 80%)",
  "repeating-linear-gradient(45deg, #c9d7e6 0 24px, #b7c7d9 24px 48px)",
  "radial-gradient(circle at 30% 20%, #9a9a9a, #6f6f6f 60%, #5c5c5c)",
  "linear-gradient(160deg, #e8e6e1, #d9d6cf)",
  "repeating-linear-gradient(0deg, #4d6b3a 0 18px, #58794a 18px 36px)",
];
const PAPERS = ["#ffffff", "#fdfdfa", "#fbfaf4", "#f8f5ec", "#fcfbf7"];

const f = (n: number, d = 2) => Number(n.toFixed(d));

/** Half the pages are phone photos, a third are scans, the rest faxes; by seed, so a set is reproducible. */
export function familyFor(seed: number): Family {
  const r = mulberry32(seed * 7_919 + 101).next();
  return r < 0.5 ? "photo" : r < 0.85 ? "scan" : "fax";
}

function doc(frame: Frame, background: string, body: string, extraCss = ""): string {
  return `<!doctype html>
<html><head><meta charset="utf-8"><style>
html,body{margin:0;padding:0}
body{width: ${frame.w}px; height: ${frame.h}px;overflow:hidden;position:relative;background:${background}}
.scene{position:absolute;inset:0;display:flex;align-items:center;justify-content:center}
.noise{position:absolute;inset:0;width:100%;height:100%;pointer-events:none}
${extraCss}
</style></head><body>
${body}
</body></html>`;
}

function noise(opacity: number, freq: number): string {
  return `<svg class="noise" style="opacity:${opacity}" xmlns="http://www.w3.org/2000/svg"><filter id="n"><feTurbulence type="fractalNoise" baseFrequency="${freq}" numOctaves="2" stitchTiles="stitch"/><feColorMatrix type="saturate" values="0"/></filter><rect width="100%" height="100%" filter="url(#n)"/></svg>`;
}

export function photoPage(letter: Synth, seed: number, frame: Frame, family: Family = familyFor(seed)): string {
  const rng = mulberry32(seed * 2_654_435 + 99 + FAMILIES.indexOf(family) * 17);
  if (family === "scan") {
    const k = f((frame.w * (0.9 + rng.next() * 0.08)) / PAGE_W, 3);
    const az = f((rng.next() - 0.5) * 5), blur = f(0.15 + rng.next() * 0.4), grey = f(0.4 + rng.next() * 0.4), contrast = f(1.02 + rng.next() * 0.12);
    const dust = Array.from({ length: rng.int(6, 18) }, () => `radial-gradient(circle at ${rng.int(0, 100)}% ${rng.int(0, 100)}%, rgba(0,0,0,${f(0.25 + rng.next() * 0.4)}) 0, rgba(0,0,0,0) ${f(0.6 + rng.next() * 1.8)}px)`).join(", ");
    const css = `.paper{position:relative;width:${PAGE_W}px;height:${PAGE_H}px;overflow:hidden;background:${rng.pick(["#f4f4f1", "#f1f0ec", "#f7f7f4"])};transform:rotateZ(${az}deg) scale(${k});filter:grayscale(${grey}) contrast(${contrast}) blur(${blur}px)}
.dust{position:absolute;inset:0;pointer-events:none;background:${dust}}
.edge{position:absolute;inset:0;pointer-events:none;background:linear-gradient(90deg, rgba(0,0,0,${f(0.08 + rng.next() * 0.1)}) 0%, rgba(0,0,0,0) 4%, rgba(0,0,0,0) 97%, rgba(0,0,0,${f(0.04 + rng.next() * 0.08)}) 100%)}`;
    return doc(frame, rng.pick(["#d9d9d6", "#cfcfcc", "#e2e2df"]), `<div class="scene"><div class="paper">\n${letter.html}\n<div class="dust"></div><div class="edge"></div></div></div>\n${noise(f(0.04 + rng.next() * 0.06), f(0.7 + rng.next() * 0.4))}`, css);
  }
  if (family === "fax") {
    const k = f((frame.w * (0.92 + rng.next() * 0.06)) / PAGE_W, 3);
    const az = f((rng.next() - 0.5) * 2), blur = f(0.5 + rng.next() * 0.5), contrast = f(1.15 + rng.next() * 0.25), band = f(0.03 + rng.next() * 0.05);
    const css = `.paper{position:relative;width:${PAGE_W}px;height:${PAGE_H}px;overflow:hidden;background:#ffffff;transform:rotateZ(${az}deg) scale(${k}) scaleY(1.02);filter:grayscale(1) contrast(${contrast}) blur(${blur}px)}
.paper .letter{font-family:'Courier New',Courier,monospace !important}
.paper .letter .head.band{background:#222 !important}
.band{position:absolute;inset:0;pointer-events:none;background:repeating-linear-gradient(0deg, rgba(0,0,0,${band}) 0 2px, rgba(0,0,0,0) 2px 7px)}
.fade{position:absolute;inset:0;pointer-events:none;background:linear-gradient(${rng.int(0, 359)}deg, rgba(255,255,255,0) 60%, rgba(255,255,255,${f(0.15 + rng.next() * 0.25)}) 100%)}`;
    return doc(frame, "#e6e6e6", `<div class="scene"><div class="paper">\n${letter.html}\n<div class="band"></div><div class="fade"></div></div></div>\n${noise(f(0.06 + rng.next() * 0.08), f(0.9 + rng.next() * 0.5))}`, css);
  }
  const fill = 0.7 + rng.next() * 0.18;
  const k = f((frame.h * fill) / PAGE_H, 3);
  const ax = f((rng.next() - 0.5) * 12), ay = f((rng.next() - 0.5) * 12), az = f((rng.next() - 0.5) * 8);
  const dx = f((rng.next() - 0.5) * frame.w * 0.08), dy = f((rng.next() - 0.5) * frame.h * 0.06);
  const blur = f(0.15 + rng.next() * 0.5), contrast = f(0.9 + rng.next() * 0.14), bright = f(0.94 + rng.next() * 0.12), sat = f(0.85 + rng.next() * 0.2);
  const angle = rng.int(0, 359), lightTop = f(0.08 + rng.next() * 0.22), lightBottom = f(0.06 + rng.next() * 0.2);
  const noiseOpacity = f(0.03 + rng.next() * 0.06), vignette = f(0.18 + rng.next() * 0.25), freq = f(0.6 + rng.next() * 0.5);
  const folds = rng.chance(0.7);
  const transform = `translate(${dx}px, ${dy}px) perspective(2400px) rotateX(${ax}deg) rotateY(${ay}deg) rotateZ(${az}deg) scale(${k})`;
  const css = `.paper{position:relative;width:${PAGE_W}px;height:${PAGE_H}px;overflow:hidden;background:${rng.pick(PAPERS)};box-shadow:0 10px 30px rgba(0,0,0,.45);transform:${transform};filter:blur(${blur}px) contrast(${contrast}) brightness(${bright}) saturate(${sat})}
.light{position:absolute;inset:0;pointer-events:none;background:linear-gradient(${angle}deg, rgba(255,255,255,${lightTop}) 0%, rgba(255,255,255,0) 45%, rgba(0,0,0,${lightBottom}) 100%)}
.fold{position:absolute;inset:0;pointer-events:none;background:linear-gradient(to bottom, transparent 32.5%, rgba(0,0,0,.07) 33.3%, rgba(255,255,255,.1) 33.9%, transparent 34.6%, transparent 65.5%, rgba(0,0,0,.07) 66.3%, rgba(255,255,255,.1) 66.9%, transparent 67.6%)}
.vignette{position:absolute;inset:0;pointer-events:none;background:radial-gradient(ellipse at center, rgba(0,0,0,0) 55%, rgba(0,0,0,${vignette}) 100%)}`;
  return doc(frame, rng.pick(TABLES), `<div class="scene"><div class="paper">\n${letter.html}\n${folds ? '<div class="fold"></div>' : ""}<div class="light"></div>\n</div></div>\n<div class="vignette"></div>\n${noise(noiseOpacity, freq)}`, css);
}
