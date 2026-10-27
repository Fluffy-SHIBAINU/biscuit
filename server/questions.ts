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
