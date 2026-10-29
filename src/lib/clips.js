// The words on Ana's "Who was at the box" carousel: the three taps, what each stored label is called, Biscuit's guess on a
// card, and the two lines that say what her taps changed on this one mailbox. The numbers come from the server
// (server/clips.ts); nothing is computed here.

export const TAPS = [
  { label: "carrier", words: "Mail carrier" },
  { label: "nothing", words: "Not mail" },
  { label: "other", words: "Someone else" },
];
export const TAP_WORDS = { mail: "Mail carrier", carrier: "Mail carrier", nothing: "Not mail", other: "Someone else", skip: "Skipped" };
export const TUNE_MIN_TAPS = 8;
export const DEFAULT_FLOOR = 0.5;
export const DEFAULT_GATE = 12;

/** One line for Ana: what her taps did. Null with no taps. */
export function tuningLine(t) {
  if (!t || !t.taps) return null;
  const taps = `From your ${t.taps} ${t.taps === 1 ? "tap" : "taps"}:`;
  if (t.taps < TUNE_MIN_TAPS) return `${taps} Biscuit keeps its usual settings until you have tapped ${TUNE_MIN_TAPS}.`;
  const floor = t.floor != null ? `the carrier shows at score ${t.floor.toFixed(2)} or more` : `the usual score floor of ${DEFAULT_FLOOR.toFixed(2)} stays until 3 deliveries and 3 non-deliveries are tapped`;
  const caught = `${t.caught} of ${t.positives} ${t.positives === 1 ? "delivery" : "deliveries"} caught`;
  const alarms = !t.negatives ? "" : t.falseAlarms ? `, ${t.falseAlarms} of ${t.negatives} false alarms left` : ", no false alarms";
  const gate = t.gate != null && t.gate > DEFAULT_GATE ? `; the phone now needs more movement before it looks (${t.gate}, was ${DEFAULT_GATE})` : "";
  return `${taps} ${floor}; ${caught}${alarms}${gate}.`;
}

export const labelWords = (label) => TAP_WORDS[label] || label;
export const pct = (c) => `${Math.round((Number(c) || 0) * 100)}%`;

/** Biscuit's guess on a card: "Biscuit thinks: Mail carrier · 80%". Null without a guess. */
export function guessLine(g) {
  if (!g || !g.label) return null;
  return `Biscuit thinks: ${labelWords(g.label)} · ${pct(g.confidence)}`;
}

const MEANS = { carrier: "the carrier", other: "someone else", nothing: "no mail" };

/** The second line: how Biscuit's guesses did on the clips Ana checked, what a prompt means at this box, which prompt now needs more, and what Biscuit classified itself. Null with nothing to say. */
export function learningLine(t) {
  if (!t || !t.prompts) return null;
  const stats = Object.entries(t.prompts);
  const checked = stats.reduce((n, [, s]) => n + (s.fired || 0), 0);
  const right = stats.reduce((n, [, s]) => n + (s.agreed || 0), 0);
  const parts = [];
  if (checked) parts.push(`Biscuit's guess was right on ${right} of ${checked} ${checked === 1 ? "clip" : "clips"} you checked`);
  for (const [p, s] of stats) if (s.learned) parts.push(`“${p}” at this box means ${MEANS[s.label] || s.label}`);
  for (const [p, s] of stats) if (s.floor != null) parts.push(`“${p}” is often wrong here and now needs a score of ${Number(s.floor).toFixed(2)}`);
  const auto = t.auto || {};
  if (auto.classified) parts.push(`Biscuit classified ${auto.classified} ${auto.classified === 1 ? "clip" : "clips"} itself${auto.corrected ? `, ${auto.corrected} of them corrected by you` : ""}`);
  return parts.length ? `${parts.join("; ")}.` : null;
}
