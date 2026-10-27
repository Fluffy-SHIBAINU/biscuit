import { Hono } from "hono";
import { claimCode } from "../codes.js";
import { getDb } from "../db.js";

const STATUS = { no_match: 404, expired: 410, used: 410, exhausted: 429 } as const;

export const linkRoutes = new Hono().post("/link/claim", async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const code = String(body?.code ?? "").replace(/\D/g, "");
  if (code.length !== 6) return c.json({ error: "no_match" }, 404);
  const result = await claimCode(getDb(), code);
  if (result.status !== "ok") return c.json({ error: result.status }, STATUS[result.status]);
  return c.json({ deviceToken: result.deviceToken, kind: result.kind, household: { called: result.household.called, language: result.household.language } });
});
