import { eq } from "drizzle-orm";
import type { MiddlewareHandler } from "hono";
import { getDb } from "./db.js";
import { device, household } from "./schema.js";
import { hashToken } from "./tokens.js";

export type DeviceRow = typeof device.$inferSelect;
export type HouseholdRow = typeof household.$inferSelect;
export type Linked = { device: DeviceRow; household: HouseholdRow };
export type AuthVars = { Variables: { device: DeviceRow; household: HouseholdRow } };
export type Lookup = (hash: string) => Promise<Linked | null>;

export async function lookupDevice(hash: string): Promise<Linked | null> {
  const rows = await getDb()
    .select({ device, household })
    .from(device)
    .innerJoin(household, eq(device.householdId, household.id))
    .where(eq(device.tokenHash, hash))
    .limit(1);
  return rows[0] ?? null;
}

export function bearer(header: string | undefined): string | null {
  const m = /^Bearer\s+(\S+)\s*$/i.exec(header ?? "");
  return m ? m[1] : null;
}

/** Device routes: a Bearer device token, or 401 {"error":"unlinked"}. */
export function deviceAuth(o: { lookup?: Lookup } = {}): MiddlewareHandler<AuthVars> {
  const lookup = o.lookup ?? lookupDevice;
  return async (c, next) => {
    const token = bearer(c.req.header("authorization"));
    const found = token ? await lookup(hashToken(token)) : null;
    if (!found) return c.json({ error: "unlinked" }, 401);
    c.set("device", found.device);
    c.set("household", found.household);
    await next();
  };
}
