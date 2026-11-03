// Drops the render's glitch frames and refills them from the frame before. Chromium now and then hands Remotion a frame
// with the page tiled small and the video or image missing; such a frame differs from both its neighbours while they
// match each other. Usage: node repair.mjs in.mp4 out.mp4
import { execSync } from "node:child_process";
import { readFileSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
const [inFile, outFile] = process.argv.slice(2);
if (!inFile || !outFile) { console.error("usage: node repair.mjs in.mp4 out.mp4"); process.exit(1); }
const dir = mkdtempSync(join(tmpdir(), "repair-"));
const d1f = join(dir, "d1.txt"), d2f = join(dir, "d2.txt");
// d1[n] = |f(n) - f(n-1)|, d2[n] = |f(n) - f(n-2)|, mean luma difference at 480 px wide
execSync(`ffmpeg -loglevel error -i "${inFile}" -vf "scale=480:-1,tblend=all_mode=difference,signalstats,metadata=print:key=lavfi.signalstats.YAVG:file=${d1f}" -f null -`);
execSync(`ffmpeg -loglevel error -i "${inFile}" -filter_complex "[0:v]scale=480:-1,split[a][b];[b]setpts=PTS+2/30/TB[d];[a][d]blend=all_mode=difference:shortest=1,signalstats,metadata=print:key=lavfi.signalstats.YAVG:file=${d2f}" -f null -`);
const load = (f) => { const out = []; let pts = 0; for (const l of readFileSync(f, "utf8").split("\n")) { const m = l.match(/pts_time:([0-9.]+)/); if (m) pts = +m[1]; const y = l.match(/YAVG=([0-9.]+)/); if (y) out.push({ pts, y: +y[1] }); } return out; };
const d1 = load(d1f), d2 = load(d2f);
const d2At = new Map(d2.map((x) => [x.pts.toFixed(3), x.y]));
const bad = [];
for (let n = 1; n < d1.length - 1; n++) {
  const a = d1[n].y, b = d1[n + 1].y, c = d2At.get(d1[n + 1].pts.toFixed(3));
  if (c == null) continue;
  if (a > 1.5 && b > 1.5 && c < Math.min(a, b) * 0.25) bad.push(n);
}
console.log(`${d1.length} frames, ${bad.length} glitch frames: ${bad.map((n) => (n / 30).toFixed(2)).join(" ")}`);
if (!bad.length) { execSync(`cp "${inFile}" "${outFile}"`); process.exit(0); }
const expr = bad.map((n) => `eq(n\\,${n})`).join("+");
execSync(`ffmpeg -loglevel error -y -i "${inFile}" -vf "select='not(${expr})',fps=30" -c:v libx264 -preset medium -crf 18 -pix_fmt yuv420p -c:a copy "${outFile}"`, { stdio: "inherit" });
console.log("wrote", outFile);
