// Probes Biscuit's neural voice end to end on a deployment: a throwaway household and Rosa device are made in the
// database, the deployment's /speak/voice and /speak are called with that device's token, and the household is deleted.
// Usage: npx tsx scripts/voice/probe-speak.ts [base-url]   (DATABASE_URL from .env.local)
// PROBE_OUT=<file.wav> saves the clip; PROBE_KEEP=1 keeps the household and prints the token for a browser test
// (delete it afterwards with PROBE_CLEAN=1).
import { config } from "dotenv";
config({ path: ".env.local", override: true });
import { eq } from "drizzle-orm";
import { getDb } from "../../server/db.js";
import { device, household } from "../../server/schema.js";
import { newToken } from "../../server/tokens.js";

const base = process.argv[2] || "https://biscuit.kindred-ai.dev";
const EMAIL = "voice-probe@biscuit.local";
const db = getDb();
await db.delete(household).where(eq(household.ownerEmail, EMAIL));
if (process.env.PROBE_CLEAN) { console.log("cleaned"); process.exit(0); }
const [h] = await db.insert(household).values({ ownerEmail: EMAIL, seniorName: "Probe", called: "Probe", tz: "America/New_York" }).returning();
const t = newToken();
await db.insert(device).values({ householdId: h.id, kind: "rosa", tokenHash: t.hash });
try {
  const headers = { authorization: `Bearer ${t.token}`, "content-type": "application/json" };
  const v = await fetch(`${base}/api/biscuit/speak/voice`, { headers });
  console.log("speak/voice", v.status, await v.text());
  const started = Date.now();
  const s = await fetch(`${base}/api/biscuit/speak`, { method: "POST", headers, body: JSON.stringify({ text: "Woof! Mail's here, Rosa." }) });
  const buf = Buffer.from(await s.arrayBuffer());
  console.log("speak", s.status, s.headers.get("content-type"), buf.length, "bytes", Date.now() - started, "ms", buf.toString("ascii", 0, 4), s.status !== 200 ? buf.toString("utf8", 0, 300) : "");
  if (process.env.PROBE_ASR) {
    // PROBE_ASR=<wav>: the clip goes to /asr as the phone would send it, and the words come back.
    const { readFileSync } = await import("node:fs");
    const form = new FormData();
    form.set("audio", new Blob([new Uint8Array(readFileSync(process.env.PROBE_ASR))], { type: "audio/wav" }), "clip.wav");
    const a0 = Date.now();
    const a = await fetch(`${base}/api/biscuit/asr`, { method: "POST", headers: { authorization: `Bearer ${t.token}` }, body: form });
    console.log("asr", a.status, Date.now() - a0, "ms", (await a.text()).slice(0, 200));
  }
  if (process.env.PROBE_OUT) { const { writeFileSync } = await import("node:fs"); writeFileSync(process.env.PROBE_OUT, buf); console.log("saved", process.env.PROBE_OUT); }
  if (process.env.PROBE_KEEP) console.log("token", t.token);
} finally {
  if (!process.env.PROBE_KEEP) await db.delete(household).where(eq(household.ownerEmail, EMAIL));
  process.exit(0);
}
