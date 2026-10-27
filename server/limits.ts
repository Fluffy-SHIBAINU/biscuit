import { sql } from "drizzle-orm";
import type { Db } from "./db.js";
import { rate } from "./schema.js";

/**
 * Fixed windows in biscuit_rate: one row per key; a window older than windowSec starts over.
 * Returns true when the call is allowed (and counted), false when the window is full.
 */
export async function checkRate(db: Db, key: string, limit: number, windowSec: number, now = new Date()): Promise<boolean> {
  const rows = await db
    .insert(rate)
    .values({ key, windowStart: now, count: 1 })
    .onConflictDoUpdate({
      target: rate.key,
      set: {
        count: sql`case when ${rate.windowStart} <= ${now.toISOString()}::timestamptz - make_interval(secs => ${windowSec}) then 1 else ${rate.count} + 1 end`,
        windowStart: sql`case when ${rate.windowStart} <= ${now.toISOString()}::timestamptz - make_interval(secs => ${windowSec}) then ${now.toISOString()}::timestamptz else ${rate.windowStart} end`,
      },
    })
    .returning({ count: rate.count });
  return (rows[0]?.count ?? 1) <= limit;
}

export type Limiter = (key: string) => Promise<boolean>;
export const dbLimiter = (getDb: () => Db, limit = 60, windowSec = 60): Limiter => (key) => checkRate(getDb(), key, limit, windowSec);
