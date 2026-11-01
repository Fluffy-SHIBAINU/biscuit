import { expect, test } from "vitest";
import { sameName } from "../src/lib/names.js";

test("sameName: her first name fits her full name, another person's does not", () => {
  expect(sameName("Rosa", "Rosa Martinez")).toBe(true);
  expect(sameName("Mrs. Rosa Martinez", "Rosa")).toBe(true);
  expect(sameName("R. Martinez", "Rosa Martinez")).toBe(true);
  expect(sameName("Sangful Yoon", "Rosa")).toBe(false);
  expect(sameName("", "Rosa")).toBe(false);
});
