import { and, eq, sql } from "drizzle-orm";
import { Hono } from "hono";
import type { MiddlewareHandler } from "hono";
import type { AnaVars, AuthVars } from "../auth.js";
import { getDb } from "../db.js";
import type { Events } from "../events.js";
import { HELP_PAYLOAD, sendPush, type Sender } from "../push.js";
import { event } from "../schema.js";

async function acked(householdId: string, eventId: number): Promise<boolean> {
  const rows = await getDb().select({ id: event.id }).from(event).where(and(eq(event.householdId, householdId), eq(event.kind, "help_test_ack"), sql`(${event.data}->>'eventId')::bigint = ${eventId}`)).limit(1);
  return rows.length > 0;
}

export function helpRoutes(deps: { auth: MiddlewareHandler<AuthVars>; anaAuth: MiddlewareHandler<AnaVars>; events: Events; send?: Sender }) {
  const push = (householdId: string, called: string, eventId: number) => sendPush(getDb(), householdId, ["ana"], HELP_PAYLOAD(called, eventId, true), { send: deps.send }).catch(() => ({ sent: 0 }));
  return new Hono()
    .post("/help/test", deps.auth as any, async (c: any) => {
      const h = c.var.household;
      const eventId = await deps.events.record(h.id, c.var.device.id, "help_test", {});
      const { sent } = await push(h.id, h.called, eventId);
      return c.json({ eventId, sent });
    })
    .get("/help/test/:id", deps.auth as any, async (c: any) => {
      const id = Number(c.req.param("id"));
      if (!Number.isInteger(id)) return c.json({ error: "bad_event" }, 400);
      return c.json({ acked: await acked(c.var.household.id, id) });
    })
    .post("/help/test/self", deps.anaAuth as any, async (c: any) => {
      const h = c.var.household;
      const eventId = await deps.events.record(h.id, null, "help_test", { from: "ana" });
      const { sent } = await push(h.id, h.called, eventId);
      return c.json({ eventId, sent });
    });
}
