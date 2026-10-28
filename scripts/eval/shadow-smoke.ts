// Production smoke test for the shadow seat: a throwaway household and Rosa device, the synthetic bill read through
// /letter/read, then the letter_read and shadow_read events it left, then everything deleted.
//   npx tsx scripts/eval/shadow-smoke.ts [--base https://biscuit.kindred-ai.dev] [--wait 20]
// Needs DATABASE_URL in .env.local. The reply itself never carries the shadow; the event does, a few seconds later.
import { config } from "dotenv";
import { readFileSync } from "node:fs";
import { desc, eq } from "drizzle-orm";
import { getDb } from "../../server/db.js";
import { device, event, household } from "../../server/schema.js";
import { newToken } from "../../server/tokens.js";

config({ path: ".env.local", override: true });
const argOf = (n: string, d: string) => { const i = process.argv.indexOf(`--${n}`); return i >= 0 ? process.argv[i + 1] : d; };
const base = argOf("base", "https://biscuit.kindred-ai.dev");
const wait = Number(argOf("wait", "20"));
const db = getDb();
const jpeg = readFileSync(new URL("../../tests/fixtures/letter-synthetic.jpg", import.meta.url));
let householdId = "";
try {
  const [h] = await db.insert(household).values({ ownerEmail: "shadow-smoke@biscuit.local", seniorName: "Smoke Test", called: "Smoke" }).returning();
  householdId = h.id;
  const t = newToken();
  await db.insert(device).values({ householdId, kind: "rosa", tokenHash: t.hash, label: "smoke" });
  const form = new FormData();
  form.set("image", new Blob([jpeg], { type: "image/jpeg" }), "l.jpg");
  const started = Date.now();
  const res = await fetch(`${base}/api/biscuit/letter/read`, { method: "POST", headers: { authorization: `Bearer ${t.token}` }, body: form });
  const body: any = await res.json();
  console.log("read:", res.status, `${Date.now() - started} ms`, JSON.stringify({ readBy: body.readBy, readers: body.readers, facts: body.facts?.filter((f: any) => f.spoken).length, checks: body.checks?.length, lines: body.lines?.slice(0, 2) }));
  await new Promise((r) => setTimeout(r, wait * 1000));
  const rows = await db.select().from(event).where(eq(event.householdId, householdId)).orderBy(desc(event.at));
  for (const r of rows) console.log(r.kind, JSON.stringify(r.data));
} finally {
  if (householdId) { await db.delete(household).where(eq(household.id, householdId)); console.log("smoke household deleted"); }
  process.exit(0);
}
