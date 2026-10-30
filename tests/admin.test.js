import { expect, test } from "vitest";
import { isAdminView } from "../src/lib/admin.js";

// The admin view on Ana's page: the founder's household (household.admin, from CAM_COLLECT_OWNER) and the page opened as
// /ana?admin=1. Everyone else, and the founder without the flag, never has the numbers rendered.
test("isAdminView needs both the admin household and ?admin=1", () => {
  expect(isAdminView("?admin=1", true)).toBe(true);
  expect(isAdminView("?x=2&admin=1", true)).toBe(true);
  expect(isAdminView("?admin=1", false)).toBe(false);
  expect(isAdminView("?admin=1", undefined)).toBe(false);
  expect(isAdminView("", true)).toBe(false);
  expect(isAdminView("?admin=0", true)).toBe(false);
  expect(isAdminView("?admin=true", true)).toBe(false);
  expect(isAdminView(null, true)).toBe(false);
});
