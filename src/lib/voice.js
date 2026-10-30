// The phone's own voice, chosen with care: an enhanced or premium English voice over a compact one, a warm male voice first
// (Biscuit is "he"), a voice Rosa or Ana named over everything, never a voice in another language. Lines are spoken a
// sentence at a time so the voice breathes and a "stop" lands between sentences.

const MALE = /\b(tom|evan|aaron|daniel|alex|arthur|oliver|fred|lee|rishi|george|james|michael|guy|ryan|brian)\b/i;
const FEMALE = /\b(ava|zoe|allison|samantha|nicky|susan|karen|moira|tessa|fiona|kate|serena|martha|joanna|sara|jenny|aria|emma)\b/i;
const RICH = /enhanced|premium|natural|neural|siri/i;

/** The best voice for `lang` among the phone's voices, or null when it has none in that language. */
export function pickVoice(voices, { name = null, prefer = "male", lang = "en" } = {}) {
  const english = (voices || []).filter((v) => (v.lang || "").toLowerCase().startsWith(lang));
  if (!english.length) return null;
  if (name) { const named = english.find((v) => v.name === name); if (named) return named; }
  const score = (v) => {
    let s = 0;
    if (RICH.test(v.name)) s += 40;
    if (/google|microsoft/i.test(v.name)) s += 20;
    if (prefer === "male" ? MALE.test(v.name) : FEMALE.test(v.name)) s += 10;
    if ((v.lang || "").toLowerCase() === "en-us") s += 5;
    if (/compact/i.test(v.name)) s -= 30;
    return s;
  };
  return [...english].sort((a, b) => score(b) - score(a))[0];
}

/** Sentences of a line, split where a full stop, question or exclamation mark is followed by a space and a capital, digit or quote; abbreviations like "Dr." stay with their sentence. */
export function sentences(text) {
  const t = (text || "").trim();
  if (!t) return [];
  const parts = t.split(/(?<=[.?!])\s+(?=[A-Z0-9$"“])/).map((s) => s.trim()).filter(Boolean);
  const out = [];
  for (const part of parts) {
    if (out.length && /\b(?:Dr|Mr|Mrs|Ms|St|No|vs)\.$/.test(out[out.length - 1])) out[out.length - 1] += " " + part;
    else out.push(part);
  }
  return out;
}
