/** The hours Ana can pick for "the mail usually comes": eight in the morning to six in the evening, in minutes after midnight. */
export const MAIL_TIMES = Array.from({ length: 11 }, (_, i) => (8 + i) * 60);

/** "1 PM", "1:30 PM": the same words the server speaks (server/chime.ts). */
export function mailTimeLabel(minutes) {
  const h = Math.floor(minutes / 60) % 24, m = minutes % 60;
  const hour = h % 12 === 0 ? 12 : h % 12;
  return `${hour}${m ? `:${String(m).padStart(2, "0")}` : ""} ${h < 12 ? "AM" : "PM"}`;
}

/** The one line under the Mail Time card's title on Ana's page. */
export function mailTimeLine(minutes) {
  return minutes == null ? "No Chime Set" : `Usual Mail Time ${mailTimeLabel(minutes)}`;
}

/** This phone's zone, for the server to keep as the household's. */
export function browserTz() {
  try { return Intl.DateTimeFormat().resolvedOptions().timeZone || null; } catch { return null; }
}

const sameDay = (a, b) => a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
const clock = (d) => d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });

/** The Today's mail line on Home: a sighting today, else the usual hour when Ana set one. */
export function todaysMailLine({ seenAt, now = new Date(), mailMinutes }) {
  const seen = seenAt ? new Date(seenAt) : null;
  if (seen && sameDay(seen, now)) return `The mail came at ${clock(seen)}.`;
  return mailMinutes == null ? "No mail seen yet today." : `No mail seen yet today. It usually comes about ${mailTimeLabel(mailMinutes)}.`;
}

/** The small line under it: who is watching the box. hasCam is null before the first refresh, so the mailbox-phone words stay until the server says there is none. */
export function mailSourceLabel({ hasCam, mailMinutes }) {
  if (hasCam === false) return mailMinutes == null ? "No mailbox phone · tap below when the mail comes" : "No mailbox phone · Biscuit chimes about the usual time";
  return "Seen by the mailbox phone · no pictures kept";
}
