import { timingSafeEqual } from "node:crypto";
import { Hono } from "hono";
import { runChimeTick } from "../chime.js";
import { retireClips } from "../clips.js";
import { runReminderTick } from "../reminders.js";
import { getDb } from "../db.js";
import type { Events } from "../events.js";
import type { Sender } from "../push.js";

const same = (a: string, b: string) => a.length === b.length && timingSafeEqual(Buffer.from(a), Buffer.from(b));

/** The tick a scheduler calls every ten minutes with `Authorization: Bearer <CRON_SECRET>` (Vercel's cron convention, so either a Vercel cron or the GitHub Actions schedule fits). GET or POST. After the chime it retires clips past their retention (server/clips.ts); a failure there is logged and never stops the chime. */
export function chimeRoutes(deps: { env?: Record<string, string | undefined>; events: Events; send?: Sender }) {
  const env = deps.env ?? process.env;
  return new Hono().on(["GET", "POST"], "/chime/tick", async (c) => {
    const secret = env.CRON_SECRET?.trim() ?? "";
    const given = (c.req.header("authorization") ?? "").replace(/^Bearer\s+/i, "").trim();
    if (!secret || !same(given, secret)) return c.json({ error: "unauthorized" }, 401);
    const now = new Date();
    const r = await runChimeTick(getDb(), now, { events: deps.events, send: deps.send });
    let remindersSent = 0;
    try { remindersSent = (await runReminderTick(getDb(), now, { events: deps.events, send: deps.send })).remindersSent; } catch (err: any) { console.log(JSON.stringify({ reminders: "tick_failed", error: String(err?.message ?? err).slice(0, 200) })); }
    let clipsRetired: number | null = null;
    try { clipsRetired = await retireClips(getDb(), now); } catch (err: any) { console.log(JSON.stringify({ clips: "retire_failed", error: String(err?.message ?? err).slice(0, 200) })); }
    return c.json({ ...r, remindersSent, clipsRetired, at: now.toISOString() });
  });
}
