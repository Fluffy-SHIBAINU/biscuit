const NUMBERS = { one: "1", two: "2", three: "3", four: "4", five: "5", six: "6" };

/** yes / no / unsure / a small number from spoken words; "no" wins over a "yes" inside a sentence. */
export function answerFrom(text) {
  const t = (text || "").toLowerCase();
  if (/\bnot sure\b|\bdon'?t know\b|\bmaybe\b|\bunsure\b/.test(t)) return "unsure";
  if (/\b(no|nope|not|never|didn'?t|haven'?t|don'?t)\b/.test(t)) return "no";
  if (/\b(yes|yeah|yep|correct|right|sure|i did|it is)\b/.test(t)) return "yes";
  const n = t.match(/\b(\d+|one|two|three|four|five|six)\b/);
  if (n) return NUMBERS[n[1]] || n[1];
  return null;
}
