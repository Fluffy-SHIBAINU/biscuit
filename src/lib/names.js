// Is this name hers? The same test the server uses: every token of the shorter name fits the longer (an initial fits a
// word that starts with it), or the last names match and the first initials do.
export function nameTokens(s) {
  return (s || "").toLowerCase().normalize("NFKD").replace(/[̀-ͯ]/g, "").replace(/[^a-z\s'-]/g, " ").split(/[\s'-]+/).filter((t) => t && !["mr", "mrs", "ms", "dr", "miss", "jr", "sr", "ii", "iii"].includes(t));
}
export function sameName(a, b) {
  const ta = nameTokens(a), tb = nameTokens(b);
  if (!ta.length || !tb.length) return false;
  const [short, long] = ta.length <= tb.length ? [ta, tb] : [tb, ta];
  const fits = (t) => long.some((u) => u === t || (t.length === 1 && u.startsWith(t)));
  if (short.every(fits)) return true;
  return ta[ta.length - 1] === tb[tb.length - 1] && ta[0][0] === tb[0][0];
}
