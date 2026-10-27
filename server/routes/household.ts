import { eq, sql } from "drizzle-orm";
import { Hono } from "hono";
import type { MiddlewareHandler } from "hono";
import type { AnaVars, AuthVars } from "../auth.js";
import { getDb } from "../db.js";
import { deleteCount, household } from "../schema.js";

/** One tap deletes: the household row goes, and with it devices, codes, events, letters and the camera row. Only a daily count stays. */
export async function deleteHousehold(householdId: string): Promise<void> {
  const db = getDb();
  await db.transaction(async (tx) => {
    const gone = await tx.delete(household).where(eq(household.id, householdId)).returning({ id: household.id });
    if (!gone.length) return;
    const day = new Date().toISOString().slice(0, 10);
    await tx.insert(deleteCount).values({ day, count: 1 }).onConflictDoUpdate({ target: deleteCount.day, set: { count: sql`${deleteCount.count} + 1` } });
  });
}

export function householdRoutes(deps: { auth: MiddlewareHandler<AuthVars>; anaAuth: MiddlewareHandler<AnaVars> }) {
  return new Hono()
    .delete("/household", deps.auth as any, async (c: any) => {
      await deleteHousehold(c.var.household.id);
      return c.json({ ok: true });
    })
    .delete("/household/ana", deps.anaAuth as any, async (c: any) => {
      await deleteHousehold(c.var.household.id);
      return c.json({ ok: true });
    });
}
