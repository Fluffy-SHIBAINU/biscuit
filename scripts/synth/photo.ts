// A synthetic letter as a phone would photograph it: a tilted page on a tabletop under uneven light, slightly soft, with
// sensor noise and two fold lines. Pure: the same letter and seed give the same page.
import { mulberry32 } from "./rng.js";
import type { Synth } from "./letters.js";

export type Frame = { w: number; h: number };
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

export function photoPage(letter: Synth, seed: number, frame: Frame): string {
  const rng = mulberry32(seed * 2_654_435 + 99);
  const fill = 0.7 + rng.next() * 0.18;
  const k = f((frame.h * fill) / PAGE_H, 3);
  const ax = f((rng.next() - 0.5) * 12), ay = f((rng.next() - 0.5) * 12), az = f((rng.next() - 0.5) * 8);
  const dx = f((rng.next() - 0.5) * frame.w * 0.08), dy = f((rng.next() - 0.5) * frame.h * 0.06);
  const blur = f(0.15 + rng.next() * 0.5), contrast = f(0.9 + rng.next() * 0.14), bright = f(0.94 + rng.next() * 0.12), sat = f(0.85 + rng.next() * 0.2);
  const angle = rng.int(0, 359), lightTop = f(0.08 + rng.next() * 0.22), lightBottom = f(0.06 + rng.next() * 0.2);
  const noise = f(0.03 + rng.next() * 0.06), vignette = f(0.18 + rng.next() * 0.25), freq = f(0.6 + rng.next() * 0.5);
  const folds = rng.chance(0.7);
  const transform = `translate(${dx}px, ${dy}px) perspective(2400px) rotateX(${ax}deg) rotateY(${ay}deg) rotateZ(${az}deg) scale(${k})`;
  return `<!doctype html>
<html><head><meta charset="utf-8"><style>
html,body{margin:0;padding:0}
body{width: ${frame.w}px; height: ${frame.h}px;overflow:hidden;position:relative;background:${rng.pick(TABLES)}}
.scene{position:absolute;inset:0;display:flex;align-items:center;justify-content:center}
.paper{position:relative;width:${PAGE_W}px;height:${PAGE_H}px;overflow:hidden;background:${rng.pick(PAPERS)};box-shadow:0 10px 30px rgba(0,0,0,.45);transform:${transform};filter:blur(${blur}px) contrast(${contrast}) brightness(${bright}) saturate(${sat})}
.light{position:absolute;inset:0;pointer-events:none;background:linear-gradient(${angle}deg, rgba(255,255,255,${lightTop}) 0%, rgba(255,255,255,0) 45%, rgba(0,0,0,${lightBottom}) 100%)}
.fold{position:absolute;inset:0;pointer-events:none;background:linear-gradient(to bottom, transparent 32.5%, rgba(0,0,0,.07) 33.3%, rgba(255,255,255,.1) 33.9%, transparent 34.6%, transparent 65.5%, rgba(0,0,0,.07) 66.3%, rgba(255,255,255,.1) 66.9%, transparent 67.6%)}
.vignette{position:absolute;inset:0;pointer-events:none;background:radial-gradient(ellipse at center, rgba(0,0,0,0) 55%, rgba(0,0,0,${vignette}) 100%)}
.noise{position:absolute;inset:0;width:100%;height:100%;opacity:${noise};pointer-events:none}
</style></head><body>
<div class="scene"><div class="paper">
${letter.html}
${folds ? '<div class="fold"></div>' : ""}<div class="light"></div>
</div></div>
<div class="vignette"></div>
<svg class="noise" xmlns="http://www.w3.org/2000/svg"><filter id="n"><feTurbulence type="fractalNoise" baseFrequency="${freq}" numOctaves="2" stitchTiles="stitch"/><feColorMatrix type="saturate" values="0"/></filter><rect width="100%" height="100%" filter="url(#n)"/></svg>
</body></html>`;
}
