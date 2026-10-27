import { Hono } from "hono";
import type { MiddlewareHandler } from "hono";
import type { AuthVars } from "../auth.js";
import { fetchSheet, type SheetSummary } from "../waive.js";

export type SheetFn = (ccn: string) => Promise<SheetSummary | null>;

export function sheetRoutes(deps: { auth: MiddlewareHandler<AuthVars>; sheet?: SheetFn }) {
  const sheet = deps.sheet ?? fetchSheet;
  return new Hono<AuthVars>().get("/sheet", deps.auth, async (c) => {
    const ccn = (c.req.query("ccn") ?? "").trim();
    if (!/^\w{6}$/.test(ccn)) return c.json({ error: "bad_ccn" }, 400);
    const s = await sheet(ccn);
    return s ? c.json(s) : c.json({ error: "no_sheet" }, 404);
  });
}
