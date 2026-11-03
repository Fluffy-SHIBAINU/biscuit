// Drops the render's glitch frames and refills them from the frame before. Chromium now and then hands Remotion a frame
// with the page tiled small and the video or image missing; such a frame differs from both its neighbours while they
// match each other. Measured with per-frame PSNR against the previous frame and the one before that.
// Usage: node repair.mjs in.mp4 out.mp4
import { execSync } from "node:child_process";
import { readFileSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
const [inFile, outFile] = process.argv.slice(2);
if (!inFile || !outFile) { console.error("usage: node repair.mjs in.mp4 out.mp4"); process.exit(1); }
const dir = mkdtempSync(join(tmpdir(), "repair-"));
const psnrLog = (lag, file) => { execSync(`ffmpeg -loglevel error -i "${inFile}" -i "${inFile}" -filter_complex "[1:v]setpts=PTS+${lag}/30/TB[d];[0:v][d]psnr=stats_file=${file}" -f null -`); return readFileSync(file, "utf8").trim().split("\n").map((l) => { const n = Number(/n:(\d+)/.exec(l)?.[1]); const p = /psnr_avg:([0-9.inf]+)/.exec(l)?.[1]; return [n, p === "inf" ? 99 : Number(p)]; }); };
const p1 = new Map(psnrLog(1, join(dir, "p1.txt"))); // frame n against n-1
const p2 = new Map(psnrLog(2, join(dir, "p2.txt"))); // frame n against n-2
const total = p1.size + 1;
const bad = [];
for (let n = 1; n < total - 1; n++) {
  const a = p1.get(n), b = p1.get(n + 1), c = p2.get(n + 1);
  if (a == null || b == null || c == null) continue;
  // n is unlike both neighbours, and its neighbours are alike: a single wrong frame
  if (a < 32 && b < 32 && c > 44) bad.push(n);
}
console.log(`${total} frames, ${bad.length} glitch frames: ${bad.map((n) => (n / 30).toFixed(2)).join(" ")}`);
if (!bad.length) { execSync(`cp "${inFile}" "${outFile}"`); process.exit(0); }
const expr = bad.map((n) => `eq(n\\,${n})`).join("+");
execSync(`ffmpeg -loglevel error -y -i "${inFile}" -vf "select='not(${expr})',fps=30" -c:v libx264 -preset medium -crf 18 -pix_fmt yuv420p -c:a copy "${outFile}"`, { stdio: "inherit" });
console.log("wrote", outFile);
