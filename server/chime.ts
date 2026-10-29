// The delivery-hour chime. A household with no mailbox phone (or one whose box was not seen today) gets one chime on
// Rosa's own phone at the hour Ana says the mail usually comes. The hour is a guess, never a sighting, and the words say
// so. A scheduler calls the tick every ten minutes; the window is ninety minutes wide so a late tick still chimes once.
import { and, desc, eq, isNotNull } from "drizzle-orm";
import type { Db } from "./db.js";
import type { Events } from "./events.js";
import { sendPush, type PushPayload, type Sender } from "./push.js";
import { event, household } from "./schema.js";

export const DEFAULT_TZ = "America/New_York";
export const DUE_WINDOW_MIN = 90;

export type ChimeHousehold = { id: string; called: string; mailMinutes: number | null; tz: string | null; lastDueAt: Date | null; lastSeenAt: Date | null };

const formatters = new Map<string, Intl.DateTimeFormat>();
function formatter(tz: string): Intl.DateTimeFormat {
  let f = formatters.get(tz);
  if (!f) {
    f = new Intl.DateTimeFormat("en-US", { timeZone: tz, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" });
    formatters.set(tz, f);
  }
  return f;
}

/** An IANA zone this runtime knows, or null. */
export function validTz(tz: unknown): string | null {
  if (typeof tz !== "string" || !tz.trim() || tz.length > 64) return null;
  try { formatter(tz); return tz; } catch { return null; }
}

/** The local calendar day and the minutes after local midnight, in a zone. */
export function localParts(now: Date, tz: string): { day: string; minutes: number } {
  const parts = Object.fromEntries(formatter(tz).formatToParts(now).filter((p) => p.type !== "literal").map((p) => [p.type, p.value]));
  return { day: `${parts.year}-${parts.month}-${parts.day}`, minutes: (Number(parts.hour) % 24) * 60 + Number(parts.minute) };
}

const sameLocalDay = (a: Date | null, now: Date, tz: string): boolean => a != null && localParts(a, tz).day === localParts(now, tz).day;

/** Due from the hour for ninety minutes, once a day, and never on a day the mailbox phone already saw the box move. */
export function dueNow(h: ChimeHousehold, now: Date): boolean {
  if (h.mailMinutes == null) return false;
  const tz = validTz(h.tz) ?? DEFAULT_TZ;
  const { minutes } = localParts(now, tz);
  if (minutes < h.mailMinutes || minutes >= h.mailMinutes + DUE_WINDOW_MIN) return false;
  return !sameLocalDay(h.lastDueAt, now, tz) && !sameLocalDay(h.lastSeenAt, now, tz);
}

/** "1 PM", "1:30 PM": the same words on the phone (src/lib/mailtime.js) and here. */
export function mailTimeLabel(minutes: number): string {
  const h = Math.floor(minutes / 60) % 24, m = minutes % 60;
  const hour = h % 12 === 0 ? 12 : h % 12;
  return `${hour}${m ? `:${String(m).padStart(2, "0")}` : ""} ${h < 12 ? "AM" : "PM"}`;
}

export const MAIL_DUE_PAYLOAD = (called: string, eventId?: number): PushPayload => ({ title: "Biscuit", body: `About now is when the mail usually comes, ${called}. If there's a letter, tap and I'll read it.`, url: "/mail?due=1", eventId, kind: "mail_due" });

/** One pass over every household with an hour set. The event is recorded before the push, so a failure never chimes twice; one household's failure never stops the rest. */
export async function runChimeTick(db: Db, now: Date, deps: { events: Events; send?: Sender }): Promise<{ checked: number; chimed: number }> {
  const homes = await db.select({ id: household.id, called: household.called, mailMinutes: household.mailMinutes, tz: household.tz }).from(household).where(isNotNull(household.mailMinutes));
  let chimed = 0;
  for (const home of homes) {
    try {
      const last = async (kind: "mail_due" | "mail_seen") => (await db.select({ at: event.at }).from(event).where(and(eq(event.householdId, home.id), eq(event.kind, kind))).orderBy(desc(event.at)).limit(1))[0]?.at ?? null;
      if (!dueNow({ ...home, lastDueAt: await last("mail_due"), lastSeenAt: await last("mail_seen") }, now)) continue;
      const id = await deps.events.record(home.id, null, "mail_due", { minutes: home.mailMinutes });
      const { sent } = await sendPush(db, home.id, ["rosa"], MAIL_DUE_PAYLOAD(home.called, id), { send: deps.send }).catch(() => ({ sent: 0 }));
      await db.update(event).set({ data: { minutes: home.mailMinutes, sent } }).where(eq(event.id, id));
      chimed++;
    } catch (err: any) {
      console.log(JSON.stringify({ chime: "failed", household: home.id, error: String(err?.message ?? err).slice(0, 200) }));
    }
  }
  return { checked: homes.length, chimed };
}
