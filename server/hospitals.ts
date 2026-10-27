import hospitals from "./data/hospitals.json" with { type: "json" };

export type Hospital = { ccn: string; name: string; city: string; state: string };
export type HospitalMatch = Hospital & { score: number };

const STOP = new Set(["the", "of", "and", "hospital", "medical", "center", "centre", "inc", "llc"]);
export const MATCH_FLOOR = 0.8;

export function normalizeName(s: string): string {
  return s.toLowerCase().normalize("NFKD").replace(/[̀-ͯ]/g, "").replace(/['’]/g, "").replace(/[^a-z0-9]+/g, " ").trim().replace(/\s+/g, " ");
}

function tokens(s: string): string[] {
  return normalizeName(s).split(" ").filter((t) => t && !STOP.has(t));
}

/** Two tokens match when equal, or when one is a prefix of the other and the shorter has at least three letters ("mass" ~ "massachusetts"). */
function tokenMatch(a: string, b: string): boolean {
  if (a === b) return true;
  const [short, long] = a.length <= b.length ? [a, b] : [b, a];
  return short.length >= 3 && long.startsWith(short);
}

export function overlapScore(query: string, candidate: string): number {
  const q = tokens(query);
  const c = tokens(candidate);
  if (!q.length || !c.length) return 0;
  const used = new Set<number>();
  let shared = 0;
  for (const t of q) {
    const i = c.findIndex((ct, idx) => !used.has(idx) && tokenMatch(t, ct));
    if (i >= 0) { used.add(i); shared++; }
  }
  return shared / Math.max(q.length, c.length);
}

const ROWS = hospitals as Hospital[];

/** Every distinct two-letter state printed next to a ZIP code, in order of appearance. */
export function statesFromText(text: string): string[] {
  const out: string[] = [];
  for (const m of text.matchAll(/\b([A-Z]{2})\s+\d{5}(?:-\d{4})?\b/g)) if (!out.includes(m[1])) out.push(m[1]);
  return out;
}

/**
 * A unique exact normalised name in the candidate states first; then a unique best token-overlap match at or above the
 * floor; otherwise null. Two hospitals with the same name are never guessed between.
 */
export function matchHospital(name: string, states?: string | string[]): HospitalMatch | null {
  const q = normalizeName(name);
  if (!q) return null;
  const list = (Array.isArray(states) ? states : states ? [states] : []).map((s) => s.toUpperCase());
  const pool = list.length ? ROWS.filter((h) => list.includes(h.state)) : ROWS;
  const exact = pool.filter((h) => normalizeName(h.name) === q);
  if (exact.length === 1) return { ...exact[0], score: 1 };
  if (exact.length > 1) return null;
  let best: HospitalMatch | null = null;
  let tie = false;
  for (const h of pool) {
    const score = overlapScore(name, h.name);
    if (score < MATCH_FLOOR) continue;
    if (!best || score > best.score) { best = { ...h, score }; tie = false; }
    else if (score === best.score) tie = true;
  }
  return best && !tie ? best : null;
}
