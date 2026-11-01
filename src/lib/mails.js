// My Mails: the letters Biscuit has read, newest day first, and the one line he says on landing.
import { statusLine } from "./letters.js";


const dayKey = (iso) => { const d = new Date(iso); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; };
export function dayLabel(iso, now = new Date()) {
  const d = new Date(iso);
  const today = dayKey(now.toISOString()) === dayKey(iso);
  const y = new Date(now); y.setDate(y.getDate() - 1);
  if (today) return "Today";
  if (dayKey(y.toISOString()) === dayKey(iso)) return "Yesterday";
  return d.toLocaleDateString([], { weekday: "long", month: "long", day: "numeric" });
}

/** [{ day, label, letters }] newest day first; each day's letters newest first. */
export function groupByDay(letters, now = new Date()) {
  const sorted = [...letters].sort((a, b) => new Date(b.readAt) - new Date(a.readAt));
  const groups = [];
  for (const l of sorted) {
    const day = dayKey(l.readAt);
    const g = groups[groups.length - 1];
    if (g && g.day === day) g.letters.push(l); else groups.push({ day, label: dayLabel(l.readAt, now), letters: [l] });
  }
  return groups;
}

/** Sent to Ana (the caretaker): an application handed off, a letter she was asked to look at, or one waiting on the hospital. */
export const sentToAna = (l) => Boolean(l.sentToAna) || l.status === "handoff" || l.status === "waiting_hospital" || l.status === "unknown_number";

export const senderOf = (l) => l.sender || (l.status === "not_mine" ? "someone else's letter" : "an unknown sender");

const CAP = ["one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten"];
/** What Biscuit says on landing, and nothing more: how many came today. */
export function todayLine(letters, now = new Date()) {
  const today = letters.filter((l) => dayLabel(l.readAt, now) === "Today").length;
  if (!today) return "No mail today.";
  return `Today you got ${CAP[today - 1] || today} ${today === 1 ? "mail" : "mails"}.`;
}

/** The spoken reading of one letter from the list: who, then its status line. */
export const readLine = (l) => `${senderOf(l)}. ${statusLine(l)}`;
