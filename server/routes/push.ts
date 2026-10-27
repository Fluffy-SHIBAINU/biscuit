import { and, eq, sql } from "drizzle-orm";
import { Hono } from "hono";
import type { MiddlewareHandler } from "hono";
import type { AnaVars, AuthVars } from "../auth.js";
import { getDb } from "../db.js";
import type { Events } from "../events.js";
import { publicKey } from "../push.js";
import { device } from "../schema.js";

function validSubscription(s: any): boolean {
  return s && typeof s.endpoint === "string" && /^https:\/\//.test(s.endpoint) && s.keys && typeof s.keys.p256dh === "string" && typeof s.keys.auth === "string";
}

export function pushRoutes(deps: { auth: MiddlewareHandler<AuthVars>; anaAuth: MiddlewareHandler<AnaVars>; events: Events }) {
  return new Hono()
    .get("/push/key", (c) => c.json({ key: publicKey() }))
    .post("/push/subscribe", deps.auth as any, async (c: any) => {
      const b = await c.req.json().catch(() => ({}));
      if (!validSubscription(b?.subscription)) return c.json({ error: "bad_subscription" }, 400);
      await getDb().update(device).set({ pushSubscription: b.subscription, lastSeenAt: new Date() }).where(eq(device.id, c.var.device.id));
      return c.json({ ok: true });
    })
    .post("/push/subscribe/ana", deps.anaAuth as any, async (c: any) => {
      const b = await c.req.json().catch(() => ({}));
      if (!validSubscription(b?.subscription)) return c.json({ error: "bad_subscription" }, 400);
      const h = c.var.household.id;
      const existing = await getDb().select({ id: device.id }).from(device).where(and(eq(device.householdId, h), eq(device.kind, "ana"), sql`${device.pushSubscription}->>'endpoint' = ${b.subscription.endpoint}`)).limit(1);
      if (existing[0]) await getDb().update(device).set({ pushSubscription: b.subscription, lastSeenAt: new Date() }).where(eq(device.id, existing[0].id));
      else await getDb().insert(device).values({ householdId: h, kind: "ana", label: "Ana's browser", pushSubscription: b.subscription, lastSeenAt: new Date() });
      return c.json({ ok: true });
    })
    .post("/push/ack", deps.anaAuth as any, async (c: any) => {
      const b = await c.req.json().catch(() => ({}));
      const eventId = Number(b?.eventId);
      if (!Number.isInteger(eventId)) return c.json({ error: "bad_event" }, 400);
      if (b?.kind === "help_test") await deps.events.record(c.var.household.id, null, "help_test_ack", { eventId });
      return c.json({ ok: true });
    });
}
