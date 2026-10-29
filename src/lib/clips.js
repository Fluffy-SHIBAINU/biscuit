// The words on Ana's "Who was at the box" strip: the three taps, what each stored label is called, and the one line that
// says what her taps changed on this one mailbox. The numbers come from the server (server/clips.ts); nothing is computed here.

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
