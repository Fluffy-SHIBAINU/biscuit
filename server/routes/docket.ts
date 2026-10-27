import { and, desc, eq, ne } from "drizzle-orm";
import { Hono } from "hono";
import type { MiddlewareHandler } from "hono";
import type { AuthVars } from "../auth.js";
import { getDb } from "../db.js";
import type { Events } from "../events.js";
import { EVENT_KINDS, event, household, letter, type EventKind } from "../schema.js";
import { isNull } from "drizzle-orm";
import { startUrl } from "../waive.js";
import { HELP_PAYLOAD, MAIL_PAYLOAD, sendPush, type PushPayload, type Sender } from "../push.js";

const DEVICE_EVENTS: EventKind[] = ["mail_seen", "mail_tapped", "help", "help_cancel", "help_ok", "consent", "said", "cam_online", "cam_offline", "cam_battery", "cam_paused"];
const STATUSES = ["read", "handoff", "waiting_hospital", "tossed", "unknown_number", "hidden"];
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function docketRoutes(deps: { auth: MiddlewareHandler<AuthVars>; events: Events; send?: Sender }) {
  return new Hono<AuthVars>()
    .post("/letter", deps.auth, async (c) => {
      const b = await c.req.json().catch(() => ({}));
      const id = typeof b?.id === "string" && UUID.test(b.id) ? b.id : crypto.randomUUID();
      if (!c.var.household.shareLetters) return c.json({ id, stored: false });
      const row = {
        id, householdId: c.var.household.id, readAt: b.readAt ? new Date(b.readAt) : new Date(), kind: String(b.kind ?? "other"),
        sender: b.sender ? String(b.sender) : null, hospitalCcn: b.hospitalCcn ? String(b.hospitalCcn) : null,
        amountCents: Number.isInteger(b.amountCents) ? b.amountCents : null, statementOn: b.statementOn ?? null, dueOn: b.dueOn ?? null,
        quotes: Array.isArray(b.quotes) ? b.quotes : [], answers: b.answers && typeof b.answers === "object" ? b.answers : {},
        status: STATUSES.includes(b.status) ? b.status : "read", needsReview: Boolean(b.needsReview),
      };
      await getDb().insert(letter).values(row).onConflictDoUpdate({ target: letter.id, set: { ...row, id: undefined, householdId: undefined } });
      return c.json({ id, stored: true });
    })
    .patch("/letter/:id", deps.auth, async (c) => {
      const b = await c.req.json().catch(() => ({}));
      const set: Record<string, unknown> = {};
      if (b.hidden === true) set.status = "hidden";
      else if (STATUSES.includes(b.status)) set.status = b.status;
      if (b.answers && typeof b.answers === "object") set.answers = b.answers;
      if (typeof b.needsReview === "boolean") set.needsReview = b.needsReview;
      if (!Object.keys(set).length) return c.json({ error: "nothing_to_change" }, 400);
      const rows = await getDb().update(letter).set(set).where(and(eq(letter.id, c.req.param("id")), eq(letter.householdId, c.var.household.id))).returning({ id: letter.id });
      return rows.length ? c.json({ id: rows[0].id }) : c.json({ error: "not_found" }, 404);
    })
    .post("/handoff", deps.auth, async (c) => {
      const b = await c.req.json().catch(() => ({}));
      const ccn = String(b?.ccn ?? "").trim();
      if (!/^\w{6}$/.test(ccn)) return c.json({ error: "bad_ccn" }, 400);
      const letterId = typeof b?.letterId === "string" ? b.letterId : null;
      if (letterId && UUID.test(letterId)) await getDb().update(letter).set({ status: "handoff", hospitalCcn: ccn }).where(and(eq(letter.id, letterId), eq(letter.householdId, c.var.household.id)));
      await deps.events.record(c.var.household.id, c.var.device.id, "handoff", { letterId, ccn });
      return c.json({ waiveUrl: startUrl(ccn) });
    })
    .post("/events", deps.auth, async (c) => {
      const b = await c.req.json().catch(() => ({}));
      const kind = b?.kind;
      if (!DEVICE_EVENTS.includes(kind) || !EVENT_KINDS.includes(kind)) return c.json({ error: "bad_kind" }, 400);
      const camKinds = ["mail_seen", "cam_online", "cam_offline", "cam_battery", "cam_paused"];
      if (c.var.device.kind === "cam" ? !camKinds.includes(kind) : camKinds.includes(kind) && kind !== "mail_seen") return c.json({ error: "wrong_device" }, 403);
      if (kind === "said" && typeof b?.data?.text === "string") b.data.text = b.data.text.slice(0, 300);
      const data = b?.data && typeof b.data === "object" ? b.data : {};
      const id = await deps.events.record(c.var.household.id, c.var.device.id, kind, data);
      const h = c.var.household;
      if (kind === "consent") await getDb().update(household).set({ consentedAt: new Date() }).where(and(eq(household.id, h.id), isNull(household.consentedAt)));
      const tell = (kinds: ("rosa" | "ana")[], payload: PushPayload) => sendPush(getDb(), h.id, kinds, payload, { send: deps.send }).catch(() => ({ sent: 0 }));
      if (kind === "mail_seen") await tell(["rosa"], MAIL_PAYLOAD(h.called, id));
      if (kind === "help") await tell(["ana"], HELP_PAYLOAD(h.called, id, false));
      if (kind === "help_cancel") await tell(["ana"], { title: "Biscuit · Help", body: `${h.called} cancelled the call.`, url: "/ana", eventId: id, kind });
      if (kind === "help_ok") await tell(["ana"], { title: "Biscuit · Help", body: `${h.called} says she's OK.`, url: "/ana", eventId: id, kind });
      return c.json({ id });
    })
    .patch("/household", deps.auth, async (c) => {
      const b = await c.req.json().catch(() => ({}));
      if (typeof b?.shareLetters !== "boolean") return c.json({ error: "nothing_to_change" }, 400);
      await getDb().update(household).set({ shareLetters: b.shareLetters }).where(eq(household.id, c.var.household.id));
      return c.json({ ok: true });
    })
    .get("/docket", deps.auth, async (c) => {
      const db = getDb();
      const h = c.var.household.id;
      const letters = await db.select().from(letter).where(and(eq(letter.householdId, h), ne(letter.status, "hidden"))).orderBy(desc(letter.readAt));
      const [seen] = await db.select({ at: event.at }).from(event).where(and(eq(event.householdId, h), eq(event.kind, "mail_seen"))).orderBy(desc(event.at)).limit(1);
      return c.json({
        letters,
        lastMailSeen: seen ? seen.at.toISOString() : null,
        waiting: letters.filter((l) => ["handoff", "waiting_hospital"].includes(l.status)),
      });
    });
}

