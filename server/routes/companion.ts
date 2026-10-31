import { and, asc, desc, eq, ilike, inArray, ne } from "drizzle-orm";
import { Hono } from "hono";
import type { MiddlewareHandler } from "hono";
import type { AuthVars } from "../auth.js";
import { DEFAULT_TZ, localParts, mailTimeLabel, validTz } from "../chime.js";
import { FALLBACK_REPLY, converse, type CompanionContext, type CompanionTurn, type Turn } from "../companion.js";
import { getDb } from "../db.js";
import type { Events } from "../events.js";
import { event, household, letter, memory, reminder } from "../schema.js";
import { geocode, weatherLine } from "../weather.js";

export type Converse = (input: { messages: Turn[]; context: CompanionContext }) => Promise<CompanionTurn>;
export type Geocoder = (name: string) => Promise<{ label: string; lat: number; lon: number } | null>;
export type Weather = (lat: number, lon: number) => Promise<string | null>;

const WEATHER_TTL_MS = 30 * 60_000;
// A failed weather call is tried again sooner than a good one is kept.
const WEATHER_MISS_TTL_MS = 5 * 60_000;
// Words the model may put in forget that would match nearly every fact; a term must be real before it deletes anything.
const FORGET_STOPWORDS = new Set(["i", "a", "an", "the", "my", "me", "it", "that", "this", "she", "her", "he", "his", "is", "am", "are", "to", "of", "in", "on", "at", "and", "or", "for", "with", "likes", "like", "has", "have", "thing", "about"]);
export const FORGET_MAX_ROWS = 3;
const escapeLike = (s: string) => s.replace(/[\\%_]/g, (ch) => `\\${ch}`);
/** A forget term that may delete: at least three letters and not a stopword. */
export function forgetTerm(f: string): string | null {
  const t = f.trim().replace(/^[\s"'.,!?]+|[\s"'.,!?]+$/g, "");
  if (t.length < 3 || FORGET_STOPWORDS.has(t.toLowerCase())) return null;
  return t;
}
/** Words plainly said to Biscuit: his name, a question, "you", a request or a greeting at the start. */
export function addressed(words: string): boolean {
  const t = (words || "").trim();
  return /\bbiscuit\b|\byou\b|\byour\b|\?\s*$/i.test(t) || /^(what|how|can|could|would|do|does|did|is|are|was|were|when|where|why|who|which|tell|remind|read|show|please|hey|hi|hello|good (morning|afternoon|evening)|i |i'm|my )/i.test(t);
}
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
    if (hit && Date.now() - hit.at < (hit.line ? WEATHER_TTL_MS : WEATHER_MISS_TTL_MS)) return hit.line;
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
      // The newest forty memories, oldest first in the prompt, so a new fact always reaches Biscuit.
      const mems = (await db.select().from(memory).where(eq(memory.householdId, h.id)).orderBy(desc(memory.at)).limit(40)).reverse();
      const rems = await db.select().from(reminder).where(eq(reminder.householdId, h.id)).orderBy(asc(reminder.minutes));
      const nowLocal = typeof b?.nowLocal === "string" && b.nowLocal.trim() ? b.nowLocal.trim().slice(0, 60) : new Intl.DateTimeFormat("en-US", { timeZone: tz, weekday: "long", hour: "numeric", minute: "2-digit" }).format(now);
      const weatherNow = h.lat != null && h.lon != null ? await cachedWeather(h.id, h.lat, h.lon) : null;
      const letters = await db.select({ status: letter.status }).from(letter).where(and(eq(letter.householdId, h.id), ne(letter.status, "hidden")));
      const waiting = letters.filter((l) => l.status === "handoff" || l.status === "waiting_hospital").length;
      const papers = letters.length ? `${letters.length} ${letters.length === 1 ? "letter" : "letters"}${waiting ? `, ${waiting} waiting on the hospital` : ""}` : null;
      const [seen] = await db.select({ at: event.at }).from(event).where(and(eq(event.householdId, h.id), eq(event.kind, "mail_seen"))).orderBy(desc(event.at)).limit(1);
      const mail = seen && localParts(seen.at, tz).day === localParts(now, tz).day ? `the mail came at ${clockIn(seen.at, tz)}` : null;
      const context: CompanionContext = { called: h.called, nowLocal, memories: mems.map((m) => ({ topic: m.topic, fact: m.fact })), weather: weatherNow, papers, mail, reminders: rems.map((r) => ({ label: r.label, time: mailTimeLabel(r.minutes) })) };
      let turn = await talk({ messages, context });
      // The model may call words "not for Biscuit" too readily. Words with his name, a question, words said to "you", or any
      // words inside a conversation already going are his: he is asked once more and must answer. Only third-person talk with
      // no conversation open stays ignored.
      const lastWords = messages.length && messages[messages.length - 1].role === "user" ? messages[messages.length - 1].content : "";
      if (turn.ignore && (addressed(lastWords) || messages.some((m) => m.role === "assistant"))) {
        turn = await talk({ messages, context: { ...context, mustAnswer: true } });
        if (turn.ignore) turn = { ...turn, ignore: false, reply: FALLBACK_REPLY };
      }
      let reply = turn.reply;
      if (turn.ignore) return c.json({ reply: "", action: "none", ignore: true, remembered: [], forgot: [], reminder: null, place: null });
      const remembered: string[] = [];
      for (const m of turn.remember) {
        // The same fact twice is one memory.
        const dup = await db.select({ id: memory.id }).from(memory).where(and(eq(memory.householdId, h.id), ilike(memory.fact, escapeLike(m.fact)))).limit(1);
        if (!dup.length) await db.insert(memory).values({ householdId: h.id, topic: m.topic, fact: m.fact });
        remembered.push(m.fact);
      }
      // Forget by the words she used: a real term, matched as a substring with wildcards escaped, at most a few rows a term.
      const forgot: string[] = [];
      for (const f of turn.forget) {
        const term = forgetTerm(f);
        if (!term) continue;
        const hits = await db.select({ id: memory.id, fact: memory.fact }).from(memory).where(and(eq(memory.householdId, h.id), ilike(memory.fact, `%${escapeLike(term)}%`))).orderBy(desc(memory.at)).limit(FORGET_MAX_ROWS);
        if (!hits.length) continue;
        await db.delete(memory).where(and(eq(memory.householdId, h.id), inArray(memory.id, hits.map((r) => r.id))));
        forgot.push(...hits.map((r) => r.fact));
      }
      let reminderOut: { label: string; time: string } | null = null;
      if (turn.reminder) {
        const same = await db.select({ id: reminder.id }).from(reminder).where(and(eq(reminder.householdId, h.id), eq(reminder.minutes, turn.reminder.minutes), ilike(reminder.label, escapeLike(turn.reminder.label)))).limit(1);
        if (!same.length) await db.insert(reminder).values({ householdId: h.id, label: turn.reminder.label, minutes: turn.reminder.minutes, days: null });
        reminderOut = { label: turn.reminder.label, time: mailTimeLabel(turn.reminder.minutes) };
      }
      let place: string | null = null;
      if (turn.place) {
        const g = await geocoder(turn.place).catch(() => null);
        if (g) { await db.update(household).set({ place: g.label, lat: g.lat, lon: g.lon }).where(eq(household.id, h.id)); weatherCache.delete(h.id); place = g.label; }
        // The reply may say "Boston it is" while nothing was found: say so instead.
        else reply = `I couldn't find ${turn.place}. Tell me the town and the state.`;
      }
      // Words for Ana only when the job was to pass them on, marked as relayed by Biscuit, not quoted from Rosa's mouth.
      if (turn.action === "tell_ana" && turn.tellAna) await deps.events.record(h.id, c.var.device.id, "rosa_said", { text: turn.tellAna, via: "companion" });
      return c.json({ reply, action: turn.action, ignore: false, remembered, forgot, reminder: reminderOut, place });
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
