// Read-only: the collect owner's household as the server sees it: devices, the camera row, recent events, kept samples.
//   npx tsx scripts/cam/state.ts
import { config } from "dotenv";
import { and, desc, eq, inArray } from "drizzle-orm";
import { getDb } from "../../server/db.js";
import { cam, camSample, device, event, household } from "../../server/schema.js";

config({ path: ".env.local", override: true });
const db = getDb();
const owner = process.env.CAM_COLLECT_OWNER?.trim().toLowerCase();
if (!owner) throw new Error("CAM_COLLECT_OWNER is not set");
const homes = await db.select().from(household).where(eq(household.ownerEmail, owner));
console.log(`households owned by the collect owner: ${homes.length}`);
for (const h of homes) {
  const devs = await db.select().from(device).where(eq(device.householdId, h.id));
  const [c] = await db.select().from(cam).where(eq(cam.householdId, h.id));
  const recent = await db.select({ kind: event.kind, at: event.at }).from(event).where(and(eq(event.householdId, h.id), inArray(event.kind, ["mail_seen", "cam_paused", "letter_read", "help_test", "cam_online", "consent"]))).orderBy(desc(event.at)).limit(6);
  const samples = await db.select({ id: camSample.id }).from(camSample).where(eq(camSample.householdId, h.id));
  console.log(JSON.stringify({ called: h.called, created: h.createdAt, devices: devs.map((d) => ({ kind: d.kind, label: d.label, lastSeen: d.lastSeenAt, push: Boolean(d.pushSubscription), battery: d.battery, charging: d.charging })), cam: c ? { region: c.region, setAt: c.setAt, testStatus: c.testStatus, paused: c.paused, samCallsToday: c.samCallsToday, samDay: c.samDay, lastMotionAt: c.lastMotionAt } : null, recent, samplesKept: samples.length }, null, 1));
}
process.exit(0);
