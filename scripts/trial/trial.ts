// The simulated user trial, pure parts: letter cards with the lines Biscuit would really speak, persona normalisation,
// tolerant JSON, and the aggregation of reactions. The LLM orchestration is in run.ts; nothing here calls a model.
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { composeOffer, composeReading, unknownNumber } from "../../server/compose.js";
import { normalizeExtraction, type LetterKind } from "../../server/meta/spark.js";
import { verifyFacts } from "../../server/verify.js";
import { mulberry32 } from "../synth/rng.js";

export const ROLES = ["senior", "child", "aide", "counselor", "carrier", "social_worker", "other"] as const;
export type Role = (typeof ROLES)[number];
export type Persona = { name: string; age: number; role: Role; situation: string; tech: string; hearing: string; vision: string; worries: string[]; voice: string };
export type Card = { id: string; kind: LetterKind; template: string; transcription: string; spokenLines: string[]; offerLines: string[]; questions: string[] };
export type StepReaction = { step: string; confusion: number; trust: number; quote: string };
export type Walk = { persona: string; role: Role; steps: StepReaction[]; stops: boolean; stopWhy: string };
export type Diary = { persona: string; role: Role; letter: string; kind: string; trust: number; confusion: number; wouldAct: boolean; quote: string; asks: string[] };
export type Stats = { steps: Record<string, { n: number; confusion: number; trust: number }>; stops: { n: number; of: number; why: string[] }; kinds: Record<string, { n: number; trust: number; confusion: number; wouldAct: number }>; asks: { ask: string; n: number }[] };

const QUESTIONS: Record<string, string[]> = { bill: ["Is this the first bill for this visit?", "Did you already pay this one?"], utility: ["Did you already pay this one?"], notice: ["Do you know this company?"], other: ["Do you know this company?"], ad: ["Shall I toss it?"] };

/** n held-out letters, chosen by seed, each with the lines production would speak for its true facts. */
export function letterCards(truthDir: string, n: number, seed = 1): Card[] {
  const files = readdirSync(truthDir).filter((f) => f.endsWith(".json")).sort();
  const rng = mulberry32(seed * 7_907 + 11);
  const picked = rng.shuffle(files).slice(0, n);
  return picked.map((f) => {
    const t = JSON.parse(readFileSync(join(truthDir, f), "utf8"));
    const facts = verifyFacts(normalizeExtraction(t.truth), t.transcription);
    const kind = t.kind as LetterKind;
    const unknown = unknownNumber(facts, null, kind);
    const offerLines = unknown ? ["This asks you to call a number I don't know. I'm sending it to Ana."] : kind === "bill" ? composeOffer(null, {}) : [];
    return { id: t.id, kind, template: t.template, transcription: t.transcription, spokenLines: composeReading(facts, kind), offerLines, questions: QUESTIONS[kind] ?? [] };
  });
}

const ROLE_WORDS: [RegExp, Role][] = [[/senior|elder|retire|grand|widow|living alone|older/i, "senior"], [/child|daughter|son|adult|family/i, "child"], [/aide|nurse|care/i, "aide"], [/counsel|billing|financial/i, "counselor"], [/carrier|postal|mail/i, "carrier"], [/social/i, "social_worker"]];

export function normalizePersona(raw: any): Persona {
  const roleText = String(raw?.role ?? "");
  const role: Role = (ROLES as readonly string[]).includes(roleText) ? (roleText as Role) : ROLE_WORDS.find(([re]) => re.test(roleText))?.[1] ?? "other";
  const age = Math.max(18, Math.min(95, Math.round(Number(raw?.age) || (role === "senior" ? 78 : 50))));
  const s = (v: unknown) => (typeof v === "string" ? v : "");
  return { name: s(raw?.name) || "Someone", age, role, situation: s(raw?.situation), tech: s(raw?.tech), hearing: s(raw?.hearing), vision: s(raw?.vision), worries: Array.isArray(raw?.worries) ? raw.worries.map(String) : [], voice: s(raw?.voice) };
}

/** The first JSON object in a reply, with or without fences and prose; null when there is none. */
export function parseJson(text: string): any | null {
  const a = text.indexOf("{"), b = text.lastIndexOf("}");
  if (a < 0 || b <= a) return null;
  for (let end = b; end > a; end = text.lastIndexOf("}", end - 1)) {
    try { return JSON.parse(text.slice(a, end + 1)); } catch { /* try a shorter slice */ }
    if (end - a > 200_000) break;
  }
  return null;
}

const clamp = (x: unknown, lo: number, hi: number) => Math.max(lo, Math.min(hi, Number(x) || 0));
const r2 = (x: number) => Math.round(x * 100) / 100;
const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9 ]+/g, " ").replace(/\s+/g, " ").trim();

export function aggregate(walks: Walk[], diaries: Diary[]): Stats {
  const steps: Record<string, { n: number; confusion: number; trust: number }> = {};
  for (const w of walks) for (const st of w.steps) {
    const s = (steps[st.step] ??= { n: 0, confusion: 0, trust: 0 });
    s.n++; s.confusion += clamp(st.confusion, 0, 3); s.trust += clamp(st.trust, 0, 3);
  }
  for (const s of Object.values(steps)) { s.confusion = r2(s.confusion / s.n); s.trust = r2(s.trust / s.n); }
  const stopped = walks.filter((w) => w.stops);
  const kinds: Record<string, { n: number; trust: number; confusion: number; wouldAct: number }> = {};
  const askCount = new Map<string, number>();
  for (const d of diaries) {
    const k = (kinds[d.kind] ??= { n: 0, trust: 0, confusion: 0, wouldAct: 0 });
    k.n++; k.trust += clamp(d.trust, 0, 3); k.confusion += clamp(d.confusion, 0, 3); k.wouldAct += d.wouldAct ? 1 : 0;
    for (const a of d.asks ?? []) { const key = norm(String(a)); if (key) askCount.set(key, (askCount.get(key) ?? 0) + 1); }
  }
  for (const k of Object.values(kinds)) { k.trust = r2(k.trust / k.n); k.confusion = r2(k.confusion / k.n); }
  const asks = [...askCount.entries()].map(([ask, n]) => ({ ask, n })).sort((a, b) => b.n - a.n || a.ask.localeCompare(b.ask));
  return { steps, stops: { n: stopped.length, of: walks.length, why: stopped.map((w) => w.stopWhy).filter(Boolean) }, kinds, asks };
}
