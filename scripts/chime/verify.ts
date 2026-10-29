// A live check of the delivery-hour chime against the running API: make a household whose usual hour is right now, call
// the tick with CRON_SECRET from .env.local, print what came back and the event it left, call it again to show it does
// not chime twice, then delete the household. No phone is linked to it, so nothing is pushed anywhere.
//   npx tsx scripts/chime/verify.ts [base url]
import { config } from "dotenv";
import { and, eq } from "drizzle-orm";

config({ path: ".env.local", override: true });
const { getDb } = await import("../../server/db.js");
const { event, household } = await import("../../server/schema.js");
const { localParts } = await import("../../server/chime.js");

const base = process.argv[2] ?? process.env.PUBLIC_BASE_URL ?? "https://biscuit.kindred-ai.dev";
const secret = process.env.CRON_SECRET?.trim();
if (!secret) { console.error("CRON_SECRET is not in .env.local"); process.exit(1); }
const EMAIL = "chime-verify@biscuit.local";
const TZ = "America/New_York";
const db = getDb();
const tick = () => fetch(`${base}/api/biscuit/chime/tick`, { method: "POST", headers: { authorization: `Bearer ${secret}` } });
const dueEvents = (id: string) => db.select().from(event).where(and(eq(event.householdId, id), eq(event.kind, "mail_due")));

await db.delete(household).where(eq(household.ownerEmail, EMAIL));
const [h] = await db.insert(household).values({ ownerEmail: EMAIL, seniorName: "Chime Verify", called: "Rosa", mailMinutes: localParts(new Date(), TZ).minutes, tz: TZ }).returning();
try {
  const first = await tick();
  console.log(`tick ${first.status}: ${await first.text()}`);
  const rows = await dueEvents(h.id);
  console.log(`mail_due events for the test household: ${rows.length}${rows[0] ? ` (data ${JSON.stringify(rows[0].data)})` : ""}`);
  const second = await tick();
  console.log(`second tick ${second.status}: ${await second.text()}`);
  console.log(`events after the second tick: ${(await dueEvents(h.id)).length}`);
} finally {
  await db.delete(household).where(eq(household.ownerEmail, EMAIL));
  console.log("test household deleted");
  process.exit(0);
}
