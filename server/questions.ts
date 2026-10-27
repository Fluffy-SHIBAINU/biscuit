export type LetterKind = "bill" | "notice" | "utility" | "ad" | "other";

export type Question = { text: string; kinds: LetterKind[]; needsSheet?: boolean };

/** The fixed list (spec §9.3). Spark chooses from it; it never writes a question. */
export const QUESTIONS: Record<"Q1" | "Q2" | "Q3" | "Q4" | "Q5" | "Q6", Question> = {
  Q1: { text: "Is this the first bill for this visit?", kinds: ["bill"] },
  Q2: { text: "How many people live with you?", kinds: ["bill"], needsSheet: true },
  Q3: { text: "Is Social Security your only income?", kinds: ["bill"], needsSheet: true },
  Q4: { text: "Did you already pay this one?", kinds: ["utility", "bill"] },
  Q5: { text: "Do you know this company?", kinds: ["notice", "other"] },
  Q6: { text: "Shall I toss it?", kinds: ["ad"] },
};

export type QuestionId = keyof typeof QUESTIONS;

export type Chooser = (kind: LetterKind, known: string[]) => Promise<string[]>;

/** The ids a letter of this kind may still be asked, in catalogue order. */
export function allowedQuestions(kind: LetterKind, hasSheet: boolean, known: string[]): QuestionId[] {
  return (Object.keys(QUESTIONS) as QuestionId[]).filter((id) => {
    const q = QUESTIONS[id];
    return q.kinds.includes(kind) && (!q.needsSheet || hasSheet) && !known.includes(id);
  });
}

/** At most two ids from the allowed set; the chooser proposes, the set decides, the first two allowed are the fallback. */
export async function pickQuestions(kind: LetterKind, hasSheet: boolean, known: string[], chooser: Chooser): Promise<QuestionId[]> {
  const allowed = allowedQuestions(kind, hasSheet, known);
  if (allowed.length === 0) return [];
  let proposed: string[] = [];
  try {
    proposed = await chooser(kind, known);
  } catch {
    proposed = [];
  }
  const picked = proposed.filter((id, i) => allowed.includes(id as QuestionId) && proposed.indexOf(id) === i).slice(0, 2) as QuestionId[];
  return picked.length ? picked : allowed.slice(0, 2);
}
