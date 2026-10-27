import { Hono } from "hono";
import type { MiddlewareHandler } from "hono";
import type { AuthVars } from "../auth.js";
import { chooseQuestions } from "../meta/spark.js";
import { pickQuestions, QUESTIONS, type Chooser, type LetterKind } from "../questions.js";

const KINDS: LetterKind[] = ["bill", "notice", "utility", "ad", "other"];

export function questionRoutes(deps: { auth: MiddlewareHandler<AuthVars>; chooser?: Chooser }) {
  const chooser = deps.chooser ?? chooseQuestions;
  return new Hono<AuthVars>().post("/question", deps.auth, async (c) => {
    const body = await c.req.json().catch(() => ({}));
    const kind: LetterKind = KINDS.includes(body?.kind) ? body.kind : "other";
    const known = Array.isArray(body?.known) ? body.known.filter((k: unknown) => typeof k === "string") : [];
    const ids = await pickQuestions(kind, Boolean(body?.hasSheet), known, chooser);
    return c.json({ questions: ids.map((id) => ({ id, text: QUESTIONS[id].text })) });
  });
}
