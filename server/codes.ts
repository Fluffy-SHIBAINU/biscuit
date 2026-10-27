import { randomInt } from "node:crypto";
import { eq } from "drizzle-orm";
import type { Db } from "./db.js";
import { device, household, linkCode } from "./schema.js";
import { newToken } from "./tokens.js";

export const CODE_TTL_MS = 10 * 60_000;
export const CODE_TRIES = 3;

export function newCode(): string {
  return String(randomInt(0, 1_000_000)).padStart(6, "0");
}

export type CodeRow = { expiresAt: Date; tries: number; usedAt: Date | null };
export type CodeState = "ok" | "expired" | "exhausted" | "used";

export function codeState(row: CodeRow, now: Date): CodeState {
  if (row.usedAt) return "used";
  if (now.getTime() > row.expiresAt.getTime()) return "expired";
  if (row.tries >= CODE_TRIES) return "exhausted";
  return "ok";
}

export type HouseholdRow = typeof household.$inferSelect;
export type ClaimFailure = "no_match" | Exclude<CodeState, "ok">;
export type ClaimResult = { status: "ok"; deviceToken: string; household: HouseholdRow; kind: "rosa" | "cam" } | { status: ClaimFailure };

const LABELS = { rosa: "Rosa's phone", cam: "Mailbox phone" } as const;

/** One transaction: find the code, judge it, mint the device on success, burn the code. */
export async function claimCode(db: Db, code: string, now = new Date()): Promise<ClaimResult> {
  return db.transaction(async (tx) => {
    const [row] = await tx.select().from(linkCode).where(eq(linkCode.code, code)).limit(1).for("update");
    if (!row) return { status: "no_match" };
    const state = codeState(row, now);
    if (state !== "ok") {
      await tx.update(linkCode).set({ tries: row.tries + 1 }).where(eq(linkCode.code, code));
      return { status: state as ClaimFailure };
    }
    const [home] = await tx.select().from(household).where(eq(household.id, row.householdId)).limit(1);
    if (!home) return { status: "no_match" };
    const { token, hash } = newToken();
    await tx.insert(device).values({ householdId: row.householdId, kind: row.kind, tokenHash: hash, label: LABELS[row.kind], lastSeenAt: now });
    await tx.update(linkCode).set({ usedAt: now }).where(eq(linkCode.code, code));
    return { status: "ok", deviceToken: token, household: home, kind: row.kind };
  });
}
