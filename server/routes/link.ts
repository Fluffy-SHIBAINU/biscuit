import { Hono } from "hono";
import { claimCode } from "../codes.js";
import { getDb } from "../db.js";

const STATUS = { no_match: 404, expired: 410, used: 410, exhausted: 429 } as const;

export type Limiter = (key: string) => Promise<boolean>;

export const callerKey = (c: { req: { header: (n: string) => string | undefined } }) =>
  `claim:${(c.req.header("x-forwarded-for") ?? "local").split(",")[0].trim()}`;

export const linkRoutes = (deps: { limiter?: Limiter } = {}) => new Hono().post("/link/claim", async (c) => {
  if (deps.limiter && !(await deps.limiter(callerKey(c)))) return c.json({ error: "rate" }, 429);
  const body = await c.req.json().catch(() => ({}));
  const code = String(body?.code ?? "").replace(/\D/g, "");
  if (code.length !== 6) return c.json({ error: "no_match" }, 404);
  const result = await claimCode(getDb(), code);
  if (result.status !== "ok") return c.json({ error: result.status }, STATUS[result.status]);
  return c.json({ deviceToken: result.deviceToken, kind: result.kind, household: { called: result.household.called, language: result.household.language } });
});
