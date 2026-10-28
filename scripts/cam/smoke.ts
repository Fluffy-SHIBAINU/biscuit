// Production smoke test for collect mode: a throwaway household and mailbox phone, the fixture frames sent with collect=1,
// the kept row checked, everything deleted. Run after a deploy and a migration:
//   npx tsx scripts/cam/smoke.ts [--base https://biscuit.kindred-ai.dev]
// Needs DATABASE_URL and CAM_COLLECT_OWNER in .env.local; the household is created under that owner so the server keeps the frames.
import { config } from "dotenv";
import { readFileSync } from "node:fs";
import { eq } from "drizzle-orm";
import { getDb } from "../../server/db.js";
import { cam, camSample, device, household } from "../../server/schema.js";
import { newToken } from "../../server/tokens.js";

config({ path: ".env.local", override: true });
const base = (() => { const i = process.argv.indexOf("--base"); return i >= 0 ? process.argv[i + 1] : "https://biscuit.kindred-ai.dev"; })();
const owner = process.env.CAM_COLLECT_OWNER?.trim().toLowerCase();
if (!owner) throw new Error("CAM_COLLECT_OWNER is not set");
const EMAIL = owner; // the server keeps frames only for this owner's households; the smoke household is deleted at the end
const db = getDb();
const jpeg = readFileSync(new URL("../../tests/fixtures/mailbox.jpg", import.meta.url));
let householdId = "";
try {
  const [h] = await db.insert(household).values({ ownerEmail: EMAIL, seniorName: "Smoke Test", called: "Smoke" }).returning();
  householdId = h.id;
  const t = newToken();
  await db.insert(device).values({ householdId, kind: "cam", tokenHash: t.hash, label: "smoke" });
  const headers = { authorization: `Bearer ${t.token}` };
  const region = await fetch(`${base}/api/biscuit/cam/region`, { method: "POST", headers: { ...headers, "content-type": "application/json" }, body: JSON.stringify({ region: { x: 0.1, y: 0.4, w: 0.6, h: 0.4 } }) });
  console.log("region:", region.status, await region.text());
  const form = new FormData();
  form.set("frame1", new Blob([jpeg], { type: "image/jpeg" }), "f1.jpg");
  form.set("frame2", new Blob([jpeg], { type: "image/jpeg" }), "f2.jpg");
  form.set("collect", "1");
  form.set("level", "21.5");
  form.set("test", "1");
  const started = Date.now();
  const res = await fetch(`${base}/api/biscuit/cam/frames`, { method: "POST", headers, body: form });
  console.log("frames:", res.status, await res.text(), `${Date.now() - started} ms`);
  const rows = await db.select({ id: camSample.id, test: camSample.test, level: camSample.level, seen: camSample.seen, scores: camSample.scores, frames: camSample.frames }).from(camSample).where(eq(camSample.householdId, householdId));
  console.log("kept rows:", rows.length, JSON.stringify(rows.map((r) => ({ id: r.id, test: r.test, level: r.level, seen: r.seen, scores: r.scores, frames: r.frames.length, bytes: r.frames.reduce((a, f) => a + f.length, 0) }))));
  const [row] = await db.select().from(cam).where(eq(cam.householdId, householdId));
  console.log("cam row:", JSON.stringify({ samCallsToday: row?.samCallsToday, samDay: row?.samDay }));
} finally {
  if (householdId) { await db.delete(household).where(eq(household.id, householdId)); console.log("smoke household deleted"); }
  process.exit(0);
}
