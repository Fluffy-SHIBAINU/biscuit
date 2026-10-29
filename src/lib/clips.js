// The words on Ana's "Who was at the box" card. The daughter's side is plain: the three taps in her words, Biscuit's
// guess as a sentence, one or two lines that say how things stand. The numbers, floors and prompt names live in
// Details. Everything here is words; the numbers come from the server (server/clips.ts).

/** The taps, in her words; the stored labels stay carrier, nothing, other (and skip). */
export const TAPS = [
  { label: "carrier", words: "The mail carrier" },
  { label: "nothing", words: "A car or the wind" },
  { label: "other", words: "Someone else" },
];
export const TAP_WORDS = { mail: "The mail carrier", carrier: "The mail carrier", nothing: "A car or the wind", other: "Someone else", skip: "Skipped" };
const PHRASE = { mail: "the mail carrier", carrier: "the mail carrier", nothing: "a car or the wind", other: "someone else" };
export const TUNE_MIN_TAPS = 8;
export const DEFAULT_FLOOR = 0.5;
export const DEFAULT_GATE = 12;

export const labelWords = (label) => TAP_WORDS[label] || label;
/** The same, mid-sentence: "the mail carrier". */
export const labelPhrase = (label) => PHRASE[label] || label;
export const pct = (c) => `${Math.round((Number(c) || 0) * 100)}%`;

/** What SAM saw, in words: "the mail truck", "a person". */
const SEEN = { "mail carrier": "the mail carrier", person: "a person", "mail truck": "the mail truck", envelope: "an envelope", "mailbox door": "the mailbox door", hand: "a hand" };
export const seenWords = (prompt) => SEEN[prompt] || prompt;

/** Biscuit's guess on a card, for the daughter: a sentence, no number. Null without a guess. */
export function guessLine(g) {
  if (!g || !g.label) return null;
  return `Biscuit thinks it was ${labelPhrase(g.label)}.`;
}

/** The same guess for Details: label, confidence, the prompt it rests on, the version, and what became of it. */
export function guessDetail(g) {
  if (!g || !g.label) return null;
  const parts = [`Guess: ${g.label}`, pct(g.confidence), g.prompt ? `rests on “${g.prompt}”` : "nothing fired", `version ${g.version ?? 1}`];
  if (g.auto) parts.push("classified by Biscuit");
  if (g.rejected) parts.push("said not right");
  return parts.join(" · ");
}

const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;

/** The line under the clip on stage, for the daughter. */
export function clipLine(c, group) {
  if (group === "attention") {
    if (c.guess?.rejected) return "You said that wasn't right. What was it?";
    const line = guessLine(c.guess);
    if (line) return line;
    return c.seen ? `Something moved; Biscuit saw ${seenWords(c.seen)}. What was it?` : "Something moved. What was it?";
  }
  return `${labelWords(c.label)}. ${c.labelledBy === "biscuit" ? "Biscuit sorted this one." : "You said so."}`;
}

/** The same clip for Details: id, level, what SAM saw, every score, the guess, who labelled it. */
export function clipDetail(c) {
  const scores = Object.entries(c.scores || {}).map(([k, v]) => `${k} ${Number(v).toFixed(2)}`).join(", ");
  return [
    `Clip ${c.id}`,
    `level ${c.level == null ? "unknown" : c.level}`,
    c.seen ? `SAM saw “${c.seen}”` : "SAM saw nothing it knows",
    scores ? `scores: ${scores}` : "no scores",
    guessDetail(c.guess) || "no guess",
    c.labelledBy ? `labelled by ${c.labelledBy}` : "unlabelled",
  ].join(" · ");
}

/**
 * The summary a daughter reads at the top of the card: how the box stands (clips to check, nothing moved, all sorted),
 * then, when there is something to say, how Biscuit is doing in one warm line. No percentages, floors or prompt names.
 */
export function clipsSummary({ keepClips, movementsToday, attention, classified, tuning }) {
  const lines = [];
  if (attention > 0) lines.push(`${plural(attention, "clip", "clips")} to check. Who was it?`);
  else if (!keepClips && !classified) lines.push("Clips are off. Turn them on below and Biscuit will keep a short clip of each movement for you to check.");
  else if (movementsToday > 0) lines.push("All of today's movements are sorted. Nothing to check.");
  else lines.push("Nothing has moved at the box today.");
  const stats = Object.values(tuning?.prompts || {});
  const checked = stats.reduce((n, s) => n + (s.fired || 0), 0);
  const right = stats.reduce((n, s) => n + (s.agreed || 0), 0);
  if (tuning?.auto?.classified > 0) lines.push("Biscuit now sorts the sure ones by itself; you can still say Not right.");
  else if (checked > 0) lines.push(`Good job! Biscuit is getting smarter: right ${plural(right, "time", "times")} out of ${checked}.`);
  return { title: "Who was at the box", lines };
}

/** One line for Details: what her taps did to the floor and gate. Null with no taps. */
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

const MEANS = { carrier: "the carrier", other: "someone else", nothing: "no mail" };

/** The second Details line: how Biscuit's guesses did on the clips Ana checked, what a prompt means at this box, which prompt now needs more, and what Biscuit classified itself. Null with nothing to say. */
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
