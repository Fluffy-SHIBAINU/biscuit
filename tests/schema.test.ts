import { expect, test } from "vitest";
import { getTableName } from "drizzle-orm";
import * as s from "../server/schema.js";

test("every table is prefixed", () => {
  for (const t of [s.household, s.device, s.linkCode, s.event, s.letter, s.cam, s.rate]) expect(getTableName(t)).toMatch(/^biscuit_/);
});
test("device kinds", () => expect(s.DEVICE_KINDS).toEqual(["rosa", "cam", "ana"]));
