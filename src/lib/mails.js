// My Mails: the letters Biscuit has read, newest day first, and the ways Rosa can open or hear one by voice.
import { statusLine } from "./letters.js";

const ORDINALS = ["first", "second", "third", "fourth", "fifth", "sixth", "seventh", "eighth", "ninth", "tenth"];
const WORDS = ["one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten"];
const CAP = ["One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine", "Ten"];

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

export const senderOf = (l) => l.sender || (l.status === "not_mine" ? "someone else's letter" : "an unknown sender");

// The number right after the verb ("open two", "read number three", "open the first one"), so "the one from X" and
// "the third one" are not taken for letter one; or the sender's name anywhere after the verb.
const num = (i) => `(?:the\\s+)?(?:(?:number\\s+)?(?:${i + 1}|${WORDS[i]})\\b(?!\\s+(?:from|of|about))|${ORDINALS[i]}\\b)`;
const name = (l) => (l.sender ? l.sender.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/\s+/g, "\\s+") : null);
const matcher = (verbs, i, who) => new RegExp(`\\b(?:${verbs})\\s+${num(i)}${who ? `|\\b(?:${verbs})\\b.*\\b${who}\\b` : ""}`, "i");

/** Choices for the hearing router: "open the first one", "read number two", "open the one from Mass General". */
export function mailChoices(ordered) {
  const options = [];
  ordered.slice(0, 10).forEach((l, i) => {
    const who = name(l);
    const open = matcher("open", i, who), read = matcher("read|hear|play", i, who);
    options.push({ key: `open:${l.id}`, say: `open ${WORDS[i]}`, match: (t) => open.test(t) });
    options.push({ key: `read:${l.id}`, say: `read ${WORDS[i]}`, match: (t) => read.test(t) });
  });
  return options;
}

/** What Biscuit says on the page: how many, who they are from in order, and how to ask. */
export function mailsLine(ordered) {
  if (!ordered.length) return "No mail read yet.";
  const count = ordered.length === 1 ? "One letter" : `${CAP[ordered.length - 1] || ordered.length} letters`;
  const list = ordered.slice(0, 10).map((l, i) => `${CAP[i]}: ${senderOf(l)}.`).join(" ");
  return `${count}. ${list} Say open one, or read one.`;
}

/** The spoken reading of one letter from the list: who, then its status line. */
export const readLine = (l) => `${senderOf(l)}. ${statusLine(l)}`;
