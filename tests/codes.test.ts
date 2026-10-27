import { expect, test } from "vitest";
import { codeState, newCode } from "../server/codes.js";

test("codeState", () => {
  const t0 = new Date("2026-10-27T10:00:00Z");
  const row = { expiresAt: new Date(t0.getTime() + 600_000), tries: 0, usedAt: null };
  expect(codeState(row, t0)).toBe("ok");
  expect(codeState(row, new Date(t0.getTime() + 600_001))).toBe("expired");
  expect(codeState({ ...row, tries: 3 }, t0)).toBe("exhausted");
  expect(codeState({ ...row, usedAt: t0 }, t0)).toBe("used");
});

test("newCode is six digits", () => {
  for (let i = 0; i < 20; i++) expect(newCode()).toMatch(/^\d{6}$/);
});
