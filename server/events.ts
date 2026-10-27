import { and, count, eq, gt } from "drizzle-orm";
import { getDb } from "./db.js";
import { event, type EventKind } from "./schema.js";

export type Events = {
  count(householdId: string, kind: EventKind, sinceMs: number): Promise<number>;
  record(householdId: string, deviceId: string | null, kind: EventKind, data?: Record<string, unknown>): Promise<number>;
};

export const dbEvents: Events = {
  async count(householdId, kind, sinceMs) {
    const since = new Date(Date.now() - sinceMs);
    const [row] = await getDb().select({ n: count() }).from(event).where(and(eq(event.householdId, householdId), eq(event.kind, kind), gt(event.at, since)));
    return Number(row?.n ?? 0);
  },
  async record(householdId, deviceId, kind, data = {}) {
    const [row] = await getDb().insert(event).values({ householdId, deviceId, kind, data }).returning({ id: event.id });
    return row.id;
  },
};
