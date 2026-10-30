// Reminders Rosa sets by voice ("remind me about my pills at eight"): a chime on her phone inside a quarter hour after the
// time, once a day, on the days she named or every day, in the household's zone. A chime, never advice.
import { and, eq } from "drizzle-orm";
import { DEFAULT_TZ, localParts, validTz } from "./chime.js";
import type { Db } from "./db.js";
import type { Events } from "./events.js";
import { sendPush, type PushPayload, type Sender } from "./push.js";
import { household, reminder } from "./schema.js";

export const REMINDER_WINDOW_MIN = 15;
export const DAYS = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"] as const;
export type ReminderRow = { id: number; label: string; minutes: number; days: string[] | null; lastFiredAt: Date | null };

/** "08:00", "8:00 AM", "12:30 pm", "9 pm" as minutes after midnight; null when it is not a clock time. */
export function parseTime(s: string): number | null {
  const m = /^\s*(\d{1,2})(?::(\d{2}))?\s*([ap]\.?m\.?)?\s*$/i.exec(s || "");
  if (!m) return null;
  let h = Number(m[1]); const min = m[2] ? Number(m[2]) : 0;
  const ampm = m[3]?.toLowerCase().replace(/\./g, "");
  if (min > 59) return null;
  if (ampm) { if (h < 1 || h > 12) return null; h = h % 12 + (ampm.startsWith("p") ? 12 : 0); }
  else if (h > 23) return null;
  return h * 60 + min;
}

function localWeekday(now: Date, tz: string): string {
  return new Intl.DateTimeFormat("en-US", { timeZone: tz, weekday: "short" }).format(now).slice(0, 3).toLowerCase();
}

/** Due inside the window after its time, not yet fired this local day, and on one of its days (none named means every day). */
export function dueReminder(r: ReminderRow, now: Date, tz: string): boolean {
  const { minutes, day } = localParts(now, tz);
  if (minutes < r.minutes || minutes >= r.minutes + REMINDER_WINDOW_MIN) return false;
  if (r.lastFiredAt && localParts(r.lastFiredAt, tz).day === day) return false;
  if (r.days && r.days.length && !r.days.map((d) => d.toLowerCase().slice(0, 3)).includes(localWeekday(now, tz))) return false;
  return true;
}

export const REMINDER_PAYLOAD = (called: string, label: string, eventId?: number): PushPayload => ({ title: "Biscuit", body: `Time for your ${label}, ${called}.`, url: "/", eventId, kind: "reminder" });

/** One pass over every reminder: the due ones chime Rosa's phone once; a failure for one never stops the rest. */
export async function runReminderTick(db: Db, now: Date, deps: { events: Events; send?: Sender }): Promise<{ remindersSent: number }> {
  const rows = await db.select({ id: reminder.id, label: reminder.label, minutes: reminder.minutes, days: reminder.days, lastFiredAt: reminder.lastFiredAt, householdId: reminder.householdId, called: household.called, tz: household.tz })
    .from(reminder).innerJoin(household, eq(household.id, reminder.householdId));
  let sent = 0;
  for (const r of rows) {
    try {
      if (!dueReminder(r, now, validTz(r.tz) ?? DEFAULT_TZ)) continue;
      await db.update(reminder).set({ lastFiredAt: now }).where(and(eq(reminder.id, r.id), eq(reminder.householdId, r.householdId)));
      const id = await deps.events.record(r.householdId, null, "reminder_due", { label: r.label });
      await sendPush(db, r.householdId, ["rosa"], REMINDER_PAYLOAD(r.called, r.label, id), { send: deps.send }).catch(() => ({ sent: 0 }));
      sent++;
    } catch (err: any) {
      console.log(JSON.stringify({ reminder: "failed", id: r.id, error: String(err?.message ?? err).slice(0, 200) }));
    }
  }
  return { remindersSent: sent };
}
