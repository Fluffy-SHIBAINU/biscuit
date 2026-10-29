// One SAM 3.1 call with the mailbox fixture: is the Meta Model API path open, and how long does it take?
//   npx tsx scripts/cam/sam-probe.ts [prompt]
import { config } from "dotenv";
import { readFileSync } from "node:fs";

config({ path: ".env.local", override: true });
const { detect } = await import("../../server/meta/sam.js");
const prompt = process.argv[2] ?? "mailbox";
const jpeg = readFileSync(new URL("../../tests/fixtures/mailbox.jpg", import.meta.url));
const started = Date.now();
try {
  const d = await detect(jpeg, { text: prompt });
  console.log(`sam ok in ${Date.now() - started} ms: ${d.length} detections for "${prompt}"`, JSON.stringify(d.slice(0, 2).map((x) => ({ score: x.score, box: x.box }))));
} catch (e: any) {
  console.log(`sam FAILED in ${Date.now() - started} ms: ${String(e?.message ?? e).slice(0, 300)}`);
  process.exit(1);
}
