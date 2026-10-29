import { timingSafeEqual } from "node:crypto";
import { Hono } from "hono";
import { runChimeTick } from "../chime.js";
import { getDb } from "../db.js";
import type { Events } from "../events.js";
import type { Sender } from "../push.js";

const same = (a: string, b: string) => a.length === b.length && timingSafeEqual(Buffer.from(a), Buffer.from(b));

/** The tick a scheduler calls every ten minutes with `Authorization: Bearer <CRON_SECRET>` (Vercel's cron convention, so either a Vercel cron or the GitHub Actions schedule fits). GET or POST. */
export function chimeRoutes(deps: { env?: Record<string, string | undefined>; events: Events; send?: Sender }) {
  const env = deps.env ?? process.env;
  return new Hono().on(["GET", "POST"], "/chime/tick", async (c) => {
    const secret = env.CRON_SECRET?.trim() ?? "";
    const given = (c.req.header("authorization") ?? "").replace(/^Bearer\s+/i, "").trim();
    if (!secret || !same(given, secret)) return c.json({ error: "unauthorized" }, 401);
    const now = new Date();
    const r = await runChimeTick(getDb(), now, { events: deps.events, send: deps.send });
    return c.json({ ...r, at: now.toISOString() });
  });
}
