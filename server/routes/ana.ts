import { and, desc, eq, inArray, ne } from "drizzle-orm";
import { Hono } from "hono";
import type { MiddlewareHandler } from "hono";
import { anaAuth, type AnaVars } from "../auth.js";
import { CODE_TTL_MS, newCode } from "../codes.js";
import { getDb } from "../db.js";
import { cam, device, event, household, letter, linkCode } from "../schema.js";
import { dbEvents, type Events } from "../events.js";
import { LOOK_PAYLOAD, sendPush, type Sender } from "../push.js";

const LIVING = ["alone", "with_family", "with_care"];
const CLEAN = (v: unknown, max = 80) => (typeof v === "string" ? v.trim().slice(0, max) : "");

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
    .get("/family", auth, async (c) => {
      const db = getDb();
      const h = c.var.household;
      const now = new Date();
      const devices = await db.select().from(device).where(eq(device.householdId, h.id));
      const letters = await db.select().from(letter).where(and(eq(letter.householdId, h.id), ne(letter.status, "hidden"))).orderBy(desc(letter.readAt)).limit(50);
      const events = await db.select().from(event).where(and(eq(event.householdId, h.id), inArray(event.kind, ["said", "mail_seen", "handoff", "help", "help_cancel", "help_ok", "help_test", "help_test_ack", "consent", "look_requested"]))).orderBy(desc(event.at)).limit(60);
      const [camRow] = await db.select().from(cam).where(eq(cam.householdId, h.id)).limit(1);
      const [lastRead] = await db.select().from(event).where(and(eq(event.householdId, h.id), eq(event.kind, "letter_read"))).orderBy(desc(event.at)).limit(1);
      const readData = (lastRead?.data ?? {}) as { readBy?: string; readers?: unknown[] };
      // The shadow reader's entry for that same read, when one was logged after the reply.
      const shadows = lastRead ? await db.select().from(event).where(and(eq(event.householdId, h.id), eq(event.kind, "shadow_read"))).orderBy(desc(event.at)).limit(5) : [];
      const shadowData = shadows.map((e) => e.data as any).find((d) => d?.letterEventId === lastRead!.id);
      const shadowEntry = shadowData ? [{ name: "shadow", label: shadowData.label, status: shadowData.status, ms: shadowData.ms, shadow: true, agreed: shadowData.agreed ?? 0, of: shadowData.of ?? 0, ...(shadowData.error ? { error: shadowData.error } : {}) }] : [];
      const camDevice = devices.find((d) => d.kind === "cam");
      const lastTest = events.find((e) => e.kind === "help_test");
      const acked = lastTest ? events.some((e) => e.kind === "help_test_ack" && (e.data as any)?.eventId === lastTest.id) : false;
      const openHelp = events.find((e) => e.kind === "help");
      const closed = openHelp ? events.some((e) => (e.kind === "help_ok" || e.kind === "help_cancel") && e.at > openHelp.at) : true;
      return c.json({
        household: { id: h.id, seniorName: h.seniorName, called: h.called, relation: h.relation, living: h.living, language: h.language, shareLetters: h.shareLetters, consentedAt: h.consentedAt },
        devices: devices.map((d) => ({ id: d.id, kind: d.kind, label: d.label, lastSeenAt: d.lastSeenAt, hasPush: Boolean(d.pushSubscription), battery: d.battery, charging: d.charging })),
        letters,
        said: events.filter((e) => e.kind === "said").map((e) => ({ at: e.at, text: (e.data as any)?.text ?? "" })),
        events: events.filter((e) => e.kind !== "said").map((e) => ({ id: e.id, kind: e.kind, at: e.at, data: e.data })),
        camera: { status: cameraStatus(camRow ?? null, camDevice?.lastSeenAt ?? null, now), testStatus: camRow?.testStatus ?? null, paused: camRow?.paused ?? false, battery: camDevice?.battery ?? null, charging: camDevice?.charging ?? null, lastMotionAt: camRow?.lastMotionAt ?? null, setAt: camRow?.setAt ?? null },
        help: { lastTestAt: lastTest?.at ?? null, acked, openHelpAt: closed ? null : openHelp?.at ?? null },
        readers: lastRead ? { at: lastRead.at, readBy: readData.readBy ?? "single", list: [...(Array.isArray(readData.readers) ? readData.readers : []), ...shadowEntry] } : null,
      });
    });
}
