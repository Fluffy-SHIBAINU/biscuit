import { describe, expect, test } from "vitest";
import { getDb } from "../server/db.js";
import { checkRate } from "../server/limits.js";

describe.skipIf(!process.env.DATABASE_URL)("checkRate", () => {
  test("allows 60 in a minute, refuses the 61st, allows again after the window", async () => {
    const key = `test:${Date.now()}`;
    const t0 = new Date("2026-10-27T10:00:00Z");
    for (let i = 0; i < 60; i++) expect(await checkRate(getDb(), key, 60, 60, t0)).toBe(true);
    expect(await checkRate(getDb(), key, 60, 60, new Date(t0.getTime() + 30_000))).toBe(false);
    expect(await checkRate(getDb(), key, 60, 60, new Date(t0.getTime() + 61_000))).toBe(true);
  });
});
