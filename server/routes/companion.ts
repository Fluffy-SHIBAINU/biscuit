import { and, asc, desc, eq, ilike, ne } from "drizzle-orm";
import { Hono } from "hono";
import type { MiddlewareHandler } from "hono";
import type { AuthVars } from "../auth.js";
import { DEFAULT_TZ, localParts, mailTimeLabel, validTz } from "../chime.js";
import { converse, type CompanionContext, type CompanionTurn, type Turn } from "../companion.js";
import { getDb } from "../db.js";
import type { Events } from "../events.js";
import { event, household, letter, memory, reminder } from "../schema.js";
import { geocode, weatherLine } from "../weather.js";

export type Converse = (input: { messages: Turn[]; context: CompanionContext }) => Promise<CompanionTurn>;
export type Geocoder = (name: string) => Promise<{ label: string; lat: number; lon: number } | null>;
export type Weather = (lat: number, lon: number) => Promise<string | null>;

const WEATHER_TTL_MS = 30 * 60_000;
const weatherCache = new Map<string, { at: number; line: string | null }>();
const clockIn = (d: Date, tz: string) => new Intl.DateTimeFormat("en-US", { timeZone: tz, hour: "numeric", minute: "2-digit" }).format(d);

/**
 * Biscuit the companion. The phone sends the last turns and its clock; the server adds what it knows (memories, reminders,
 * the weather at home, her papers, the mail), asks the model, applies what Rosa agreed to remember, forget, set or pass to
 * Ana, and returns the reply and the job. The conversation itself is never stored.
 */
export function companionRoutes(deps: { auth: MiddlewareHandler<AuthVars>; events: Events; converse?: Converse; geocoder?: Geocoder; weather?: Weather }) {
  const talk = deps.converse ?? ((input) => converse(input));
  const geocoder = deps.geocoder ?? ((name) => geocode(name));
  const weather = deps.weather ?? ((lat, lon) => weatherLine(lat, lon));
  const cachedWeather = async (householdId: string, lat: number, lon: number) => {
    const hit = weatherCache.get(householdId);
    if (hit && Date.now() - hit.at < WEATHER_TTL_MS) return hit.line;
    const line = await weather(lat, lon).catch(() => null);
    weatherCache.set(householdId, { at: Date.now(), line });
    return line;
  };
  return new Hono<AuthVars>()
    .post("/companion", deps.auth, async (c) => {
      const b = await c.req.json().catch(() => ({}));
      const messages: Turn[] = (Array.isArray(b?.messages) ? b.messages : []).filter((m: any) => m && (m.role === "user" || m.role === "assistant") && typeof m.content === "string").slice(-12);
      const h = c.var.household;
      const db = getDb();
      const tz = validTz(h.tz) ?? DEFAULT_TZ;
      const now = new Date();
      const mems = await db.select().from(memory).where(eq(memory.householdId, h.id)).orderBy(asc(memory.at)).limit(40);
      const rems = await db.select().from(reminder).where(eq(reminder.householdId, h.id)).orderBy(asc(reminder.minutes));
      const nowLocal = typeof b?.nowLocal === "string" && b.nowLocal.trim() ? b.nowLocal.trim().slice(0, 60) : new Intl.DateTimeFormat("en-US", { timeZone: tz, weekday: "long", hour: "numeric", minute: "2-digit" }).format(now);
      const weatherNow = h.lat != null && h.lon != null ? await cachedWeather(h.id, h.lat, h.lon) : null;
      const letters = await db.select({ status: letter.status }).from(letter).where(and(eq(letter.householdId, h.id), ne(letter.status, "hidden")));
      const waiting = letters.filter((l) => l.status === "handoff" || l.status === "waiting_hospital").length;
      const papers = letters.length ? `${letters.length} ${letters.length === 1 ? "letter" : "letters"}${waiting ? `, ${waiting} waiting on the hospital` : ""}` : null;
      const [seen] = await db.select({ at: event.at }).from(event).where(and(eq(event.householdId, h.id), eq(event.kind, "mail_seen"))).orderBy(desc(event.at)).limit(1);
      const mail = seen && localParts(seen.at, tz).day === localParts(now, tz).day ? `the mail came at ${clockIn(seen.at, tz)}` : null;
      const context: CompanionContext = { called: h.called, nowLocal, memories: mems.map((m) => ({ topic: m.topic, fact: m.fact })), weather: weatherNow, papers, mail, reminders: rems.map((r) => ({ label: r.label, time: mailTimeLabel(r.minutes) })) };
      const turn = await talk({ messages, context });
      const remembered: string[] = [];
      for (const m of turn.remember) { await db.insert(memory).values({ householdId: h.id, topic: m.topic, fact: m.fact }); remembered.push(m.fact); }
      for (const f of turn.forget) await db.delete(memory).where(and(eq(memory.householdId, h.id), ilike(memory.fact, `%${f}%`)));
      let reminderOut: { label: string; time: string } | null = null;
      if (turn.reminder) { await db.insert(reminder).values({ householdId: h.id, label: turn.reminder.label, minutes: turn.reminder.minutes, days: null }); reminderOut = { label: turn.reminder.label, time: mailTimeLabel(turn.reminder.minutes) }; }
      let place: string | null = null;
      if (turn.place) {
        const g = await geocoder(turn.place).catch(() => null);
        if (g) { await db.update(household).set({ place: g.label, lat: g.lat, lon: g.lon }).where(eq(household.id, h.id)); weatherCache.delete(h.id); place = g.label; }
      }
      if (turn.tellAna) await deps.events.record(h.id, c.var.device.id, "rosa_said", { text: turn.tellAna });
      return c.json({ reply: turn.reply, action: turn.action, remembered, forgot: turn.forget, reminder: reminderOut, place });
    })
    .get("/memories", deps.auth, async (c) => {
      const rows = await getDb().select().from(memory).where(eq(memory.householdId, c.var.household.id)).orderBy(desc(memory.at));
      return c.json({ memories: rows.map((m) => ({ id: m.id, topic: m.topic, fact: m.fact, at: m.at })) });
    })
    .delete("/memories/:id", deps.auth, async (c) => {
      const id = Number(c.req.param("id"));
      if (!Number.isInteger(id)) return c.json({ error: "bad_id" }, 400);
      const gone = await getDb().delete(memory).where(and(eq(memory.id, id), eq(memory.householdId, c.var.household.id))).returning({ id: memory.id });
      return gone.length ? c.json({ ok: true }) : c.json({ error: "not_found" }, 404);
    })
    .get("/reminders", deps.auth, async (c) => {
      const rows = await getDb().select().from(reminder).where(eq(reminder.householdId, c.var.household.id)).orderBy(asc(reminder.minutes));
      return c.json({ reminders: rows.map((r) => ({ id: r.id, label: r.label, time: mailTimeLabel(r.minutes), days: r.days })) });
    })
    .delete("/reminders/:id", deps.auth, async (c) => {
      const id = Number(c.req.param("id"));
      if (!Number.isInteger(id)) return c.json({ error: "bad_id" }, 400);
      const gone = await getDb().delete(reminder).where(and(eq(reminder.id, id), eq(reminder.householdId, c.var.household.id))).returning({ id: reminder.id });
      return gone.length ? c.json({ ok: true }) : c.json({ error: "not_found" }, 404);
    });
}
