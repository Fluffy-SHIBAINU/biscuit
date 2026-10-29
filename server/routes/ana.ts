import { and, desc, eq, gt, inArray, isNull, ne, or, sql } from "drizzle-orm";
import { Hono } from "hono";
import type { MiddlewareHandler } from "hono";
import { anaAuth, type AnaVars } from "../auth.js";
import { CODE_TTL_MS, newCode } from "../codes.js";
import { getDb } from "../db.js";
import { cam, camSample, device, event, household, letter, linkCode } from "../schema.js";
import { dropClips, isLabel, tuneHousehold } from "../clips.js";
import { dbEvents, type Events } from "../events.js";
import { LOOK_PAYLOAD, sendPush, type Sender } from "../push.js";
import { DEFAULT_TZ, localParts, validTz } from "../chime.js";

const LIVING = ["alone", "with_family", "with_care"];
const CLEAN = (v: unknown, max = 80) => (typeof v === "string" ? v.trim().slice(0, max) : "");

/** How many clips the strip shows at once: the unchecked ones first, newest first. */
export const CLIP_STRIP = 8;

export type CameraStatus = "online" | "offline" | "paused" | "not_set";
export const HEARTBEAT_MS = 60_000;
export const OFFLINE_AFTER_MS = 3 * HEARTBEAT_MS;

/** Online while a heartbeat arrived within three heartbeats; paused and not_set from the camera row. */
export function cameraStatus(row: { paused: boolean } | null, lastHeartbeatAt: Date | null, now: Date): CameraStatus {
  if (!row) return "not_set";
  if (row.paused) return "paused";
  if (!lastHeartbeatAt || now.getTime() - lastHeartbeatAt.getTime() > OFFLINE_AFTER_MS) return "offline";
  return "online";
}

export function anaRoutes(o: { env?: Record<string, string | undefined>; events?: Events; send?: Sender } = {}) {
  const events = o.events ?? dbEvents;
  const auth: MiddlewareHandler<AnaVars> = anaAuth({ env: o.env });
  const authOrNew: MiddlewareHandler<AnaVars> = anaAuth({ env: o.env, allowNone: true });
  return new Hono<AnaVars>()
    .post("/household", authOrNew, async (c) => {
      const b = await c.req.json().catch(() => ({}));
      const seniorName = CLEAN(b.seniorName);
      if (!seniorName) return c.json({ error: "name_required" }, 400);
      const values = {
        ownerEmail: c.var.kindredUser.email.toLowerCase(),
        seniorName,
        called: CLEAN(b.called) || seniorName.split(" ")[0],
        relation: CLEAN(b.relation) || null,
        living: LIVING.includes(b.living) ? b.living : null,
        language: CLEAN(b.language, 8) || "en",
      };
      const existing = c.var.household;
      if (existing) {
        await getDb().update(household).set(values).where(eq(household.id, existing.id));
        return c.json({ id: existing.id });
      }
      const [row] = await getDb().insert(household).values(values).returning({ id: household.id });
      return c.json({ id: row.id });
    })
    .post("/link/new", auth, async (c) => {
      const b = await c.req.json().catch(() => ({}));
      const kind = b?.kind === "cam" ? "cam" : b?.kind === "rosa" ? "rosa" : null;
      if (!kind) return c.json({ error: "bad_kind" }, 400);
      const expiresAt = new Date(Date.now() + CODE_TTL_MS);
      for (let attempt = 0; attempt < 5; attempt++) {
        const code = newCode();
        try {
          await getDb().insert(linkCode).values({ code, householdId: c.var.household.id, kind, expiresAt });
          return c.json({ code, expiresAt: expiresAt.toISOString() });
        } catch { /* collision: try another */ }
      }
      return c.json({ error: "try_again" }, 503);
    })
    .post("/cam/pause", auth, async (c) => {
      const rows = await getDb().update(cam).set({ paused: true }).where(eq(cam.householdId, c.var.household.id)).returning({ id: cam.householdId });
      return rows.length ? c.json({ ok: true }) : c.json({ error: "not_set" }, 404);
    })
    .post("/cam/resume", auth, async (c) => {
      const rows = await getDb().update(cam).set({ paused: false }).where(eq(cam.householdId, c.var.household.id)).returning({ id: cam.householdId });
      return rows.length ? c.json({ ok: true }) : c.json({ error: "not_set" }, 404);
    })
    .post("/family/letter/:id/again", auth, async (c) => {
      const db = getDb();
      const h = c.var.household;
      const rows = await db.update(letter).set({ lookRequestedAt: new Date() }).where(and(eq(letter.id, c.req.param("id")), eq(letter.householdId, h.id))).returning({ id: letter.id, sender: letter.sender });
      if (!rows.length) return c.json({ error: "not_found" }, 404);
      const sender = rows[0].sender || "a letter";
      await events.record(h.id, null, "look_requested", { letterId: rows[0].id, sender });
      const { sent } = await sendPush(db, h.id, ["rosa"], LOOK_PAYLOAD(sender, rows[0].id), { send: o.send }).catch(() => ({ sent: 0 }));
      return c.json({ ok: true, sent });
    })
    .patch("/family/mail-time", auth, async (c) => {
      // The hour the mail usually comes, Ana's guess, in minutes after midnight; null turns the chime off. Her zone only
      // fills a blank: once Rosa's phone has said where it is, that zone stays.
      const b = await c.req.json().catch(() => ({}));
      const minutes = b?.minutes;
      if (!(minutes === null || (Number.isInteger(minutes) && minutes >= 0 && minutes < 1440))) return c.json({ error: "bad_minutes" }, 400);
      const h = c.var.household;
      const tz = h.tz ?? validTz(b?.tz);
      await getDb().update(household).set({ mailMinutes: minutes, ...(tz && !h.tz ? { tz } : {}) }).where(eq(household.id, h.id));
      return c.json({ ok: true, mailMinutes: minutes, tz: tz ?? null });
    })
    .get("/family/clips", auth, async (c) => {
      // "Who was at the box": every kept movement with frames, the unchecked ones first, newest first, skipped ones left out.
      const h = c.var.household;
      const rows = await getDb().select().from(camSample)
        .where(and(eq(camSample.householdId, h.id), sql`jsonb_array_length(${camSample.frames}) > 0`, or(isNull(camSample.label), ne(camSample.label, "skip"))))
        .orderBy(sql`(${camSample.label} is null) desc`, desc(camSample.at)).limit(CLIP_STRIP);
      return c.json(rows.map((r) => ({ id: r.id, at: r.at, test: r.test, seen: r.seen, level: r.level, scores: r.scores, frames: r.frames, label: r.label, labelledAt: r.labelledAt })));
    })
    .patch("/family/clip/:id", auth, async (c) => {
      // A tap: the label goes on the clip and the household's floor and gate are recomputed from every tap it has.
      const id = Number(c.req.param("id"));
      if (!Number.isInteger(id) || id <= 0) return c.json({ error: "bad_id" }, 400);
      const b = await c.req.json().catch(() => ({}));
      if (!isLabel(b?.label)) return c.json({ error: "bad_label" }, 400);
      const db = getDb();
      const h = c.var.household;
      const rows = await db.update(camSample).set({ label: b.label, labelledAt: new Date() }).where(and(eq(camSample.id, id), eq(camSample.householdId, h.id))).returning({ id: camSample.id });
      if (!rows.length) return c.json({ error: "not_found" }, 404);
      const tuning = await tuneHousehold(db, h.id);
      return c.json({ ok: true, id, label: b.label, tuning });
    })
    .patch("/family/clips", auth, async (c) => {
      // Ana's two choices. "Help improve Biscuit" can only be turned on while clips are kept. Keeping clips turned off: the
      // unchecked clips go at once, and the tapped ones too unless they are still promised to the export; the numbers the taps
      // taught stay, they are numbers.
      const b = await c.req.json().catch(() => ({}));
      if (typeof b?.keep !== "boolean" && typeof b?.share !== "boolean") return c.json({ error: "bad_choice" }, 400);
      const h = c.var.household;
      const keep: boolean = typeof b.keep === "boolean" ? b.keep : h.keepClips;
      const share: boolean = typeof b.share === "boolean" ? b.share && keep : h.shareClips;
      const now = new Date();
      const db = getDb();
      await db.update(household).set({ keepClips: keep, keepClipsAt: keep ? h.keepClipsAt ?? now : null, shareClips: share, shareClipsAt: share ? h.shareClipsAt ?? now : null }).where(eq(household.id, h.id));
      const deleted = keep ? 0 : await dropClips(db, h.id, share);
      return c.json({ ok: true, keepClips: keep, shareClips: share, deleted });
    })
    .get("/family", auth, async (c) => {
      const db = getDb();
      const h = c.var.household;
      const now = new Date();
      const devices = await db.select().from(device).where(eq(device.householdId, h.id));
      const letters = await db.select().from(letter).where(and(eq(letter.householdId, h.id), ne(letter.status, "hidden"))).orderBy(desc(letter.readAt)).limit(50);
      const events = await db.select().from(event).where(and(eq(event.householdId, h.id), inArray(event.kind, ["said", "mail_seen", "mail_due", "handoff", "help", "help_cancel", "help_ok", "help_test", "help_test_ack", "consent", "look_requested", "cam_motion"]))).orderBy(desc(event.at)).limit(60);
      // Movements the phone sent today, in the household's own day.
      const tz = validTz(h.tz) ?? DEFAULT_TZ;
      const today = localParts(now, tz).day;
      const movementsToday = (await db.select({ at: event.at }).from(event).where(and(eq(event.householdId, h.id), eq(event.kind, "cam_motion"), gt(event.at, new Date(now.getTime() - 36 * 3600_000))))).filter((e) => localParts(e.at, tz).day === today).length;
      const [camRow] = await db.select().from(cam).where(eq(cam.householdId, h.id)).limit(1);
      const [clipCount] = await db.select({ total: sql<string>`count(*) filter (where jsonb_array_length(${camSample.frames}) > 0)`, pending: sql<string>`count(*) filter (where jsonb_array_length(${camSample.frames}) > 0 and ${camSample.label} is null)` }).from(camSample).where(eq(camSample.householdId, h.id));
      const [lastRead] = await db.select().from(event).where(and(eq(event.householdId, h.id), eq(event.kind, "letter_read"))).orderBy(desc(event.at)).limit(1);
      const readData = (lastRead?.data ?? {}) as { readBy?: string; readers?: unknown[] };
      // The shadow reader's entry for that same read, when one was logged after the reply.
      const shadows = lastRead ? await db.select().from(event).where(and(eq(event.householdId, h.id), eq(event.kind, "shadow_read"))).orderBy(desc(event.at)).limit(5) : [];
      const shadowData = shadows.map((e) => e.data as any).find((d) => d?.letterEventId === lastRead!.id);
      const shadowEntry = shadowData ? [{ name: "shadow", label: shadowData.label, status: shadowData.status, ms: shadowData.ms, shadow: true, agreed: shadowData.agreed ?? 0, of: shadowData.of ?? 0, ...(shadowData.error ? { error: shadowData.error } : {}) }] : [];
      // A re-linked mailbox phone leaves an older row behind: the one seen last is the one on the sill.
      const camDevice = devices.filter((d) => d.kind === "cam").sort((a, b) => (b.lastSeenAt?.getTime() ?? 0) - (a.lastSeenAt?.getTime() ?? 0))[0];
      const lastTest = events.find((e) => e.kind === "help_test");
      const acked = lastTest ? events.some((e) => e.kind === "help_test_ack" && (e.data as any)?.eventId === lastTest.id) : false;
      const openHelp = events.find((e) => e.kind === "help");
      const closed = openHelp ? events.some((e) => (e.kind === "help_ok" || e.kind === "help_cancel") && e.at > openHelp.at) : true;
      return c.json({
        household: { id: h.id, seniorName: h.seniorName, called: h.called, relation: h.relation, living: h.living, language: h.language, shareLetters: h.shareLetters, consentedAt: h.consentedAt, mailMinutes: h.mailMinutes ?? null, tz: h.tz ?? null, keepClips: h.keepClips, keepClipsAt: h.keepClipsAt, shareClips: h.shareClips, shareClipsAt: h.shareClipsAt },
        devices: devices.map((d) => ({ id: d.id, kind: d.kind, label: d.label, lastSeenAt: d.lastSeenAt, hasPush: Boolean(d.pushSubscription), battery: d.battery, charging: d.charging })),
        letters,
        said: events.filter((e) => e.kind === "said").map((e) => ({ at: e.at, text: (e.data as any)?.text ?? "" })),
        events: events.filter((e) => e.kind !== "said").map((e) => ({ id: e.id, kind: e.kind, at: e.at, data: e.data })),
        camera: { status: cameraStatus(camRow ?? null, camDevice?.lastSeenAt ?? null, now), movementsToday, paused: camRow?.paused ?? false, battery: camDevice?.battery ?? null, charging: camDevice?.charging ?? null, lastMotionAt: camRow?.lastMotionAt ?? null, setAt: camRow?.setAt ?? null, regionSource: camRow?.regionSource ?? null, floor: camRow?.floor ?? null, gate: camRow?.gate ?? null, tuning: camRow?.tuning ?? null, clips: { pending: Number(clipCount?.pending ?? 0), total: Number(clipCount?.total ?? 0) } },
        help: { lastTestAt: lastTest?.at ?? null, acked, openHelpAt: closed ? null : openHelp?.at ?? null },
        readers: lastRead ? { at: lastRead.at, readBy: readData.readBy ?? "single", list: [...(Array.isArray(readData.readers) ? readData.readers : []), ...shadowEntry] } : null,
      });
    });
}
