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
export function deviceAuth(o: { lookup?: Lookup; limiter?: (key: string) => Promise<boolean>; exempt?: (path: string) => boolean } = {}): MiddlewareHandler<AuthVars> {
  const lookup = o.lookup ?? lookupDevice;
  return async (c, next) => {
    const token = bearer(c.req.header("authorization"));
    const found = token ? await lookup(hashToken(token)) : null;
    if (!found) return c.json({ error: "unlinked" }, 401);
    if (o.limiter && !(o.exempt && o.exempt(c.req.path)) && !(await o.limiter(`device:${found.device.id}`))) return c.json({ error: "rate" }, 429);
    c.set("device", found.device);
    c.set("household", found.household);
    await next();
  };
}

import { requireKindredUser } from "./kindred/hono.js";
import type { KindredUser } from "./kindred/kindred-auth.js";

export type AnaVars = { Variables: { kindredUser: KindredUser; household: HouseholdRow } };

/** Ana's routes: a Kindred session (or the local bypass), then her household; 404 when she has none, except where `allowNone`. */
export function anaAuth(o: { env?: Record<string, string | undefined>; allowNone?: boolean } = {}): MiddlewareHandler<AnaVars> {
  const wall = requireKindredUser({ env: o.env ?? process.env });
  return async (c, next) => {
    let passed = false;
    const res = await wall(c as any, async () => { passed = true; });
    if (!passed) return res as Response;
    const email = c.var.kindredUser.email.toLowerCase();
    const [home] = await getDb().select().from(household).where(eq(household.ownerEmail, email)).limit(1);
    if (!home && !o.allowNone) return c.json({ error: "no_household" }, 404);
    if (home) c.set("household", home);
    await next();
  };
}

/** After deviceAuth: only these device kinds may continue; the mailbox phone never reaches Rosa's routes. */
export function requireKind(...kinds: ("rosa" | "cam" | "ana")[]): MiddlewareHandler<AuthVars> {
  return async (c, next) => {
    if (!kinds.includes(c.var.device.kind)) return c.json({ error: "wrong_device" }, 403);
    await next();
  };
}
