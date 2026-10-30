// Talk to Biscuit: the words become one of five moves. Patterns, not a model: anything unclear gets the menu, never a guess.

export const MENU_LINES = ["I can read a letter, go through your papers, or pass a message to Ana.", "What'll it be?"];

const TELL = /^\s*(?:please\s+)?(?:tell|let)\s+an+a\b(?:\s+know)?[,:]?\s*(.*)$/i;

/** { intent: "letter" | "papers" | "mail" | "tell" | "menu" | "nothing", text? } from what Rosa said. */
export function intentOf(text) {
  const t = (text || "").trim();
  if (!t) return { intent: "nothing" };
  const tell = TELL.exec(t);
  if (tell) return { intent: "tell", text: tell[1].replace(/[.?!\s]+$/, "").trim() };
  if (/\b(mail|mailbox|post)\b.*\b(came|come|arrived|here|delivered)\b|\b(came|arrived)\b.*\bmail\b/i.test(t)) return { intent: "mail" };
  if (/\b(letter|bill|mail|envelope|statement|notice|read)\b/i.test(t)) return { intent: "letter" };
  if (/\b(papers?|what do i have|what have i got|my list|the list|anything waiting)\b/i.test(t)) return { intent: "papers" };
  return { intent: "menu" };
}
