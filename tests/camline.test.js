import { expect, test } from "vitest";
import { BOX_SOURCE_WORDS, cameraLine } from "../src/lib/camline.js";

// The line beside the Mailbox phone pill on Ana's page: power, the last movement, the test, and who set the box.
const clock = () => "8:52 PM";

test("the words for who set the box", () => {
  expect(BOX_SOURCE_WORDS).toEqual({ hand: "box set by hand", sam: "box found by SAM" });
});

test("cameraLine", () => {
  expect(cameraLine({ status: "not_set" }, clock)).toBe("No spare phone yet.");
  expect(cameraLine({ status: "online", battery: 80, charging: true, lastMotionAt: "2026-10-29T00:52:00Z", testStatus: "works", regionSource: "hand" }, clock)).toBe("plugged in, 80% · last movement 8:52 PM · box set by hand");
  expect(cameraLine({ status: "offline", battery: 40, charging: false, lastMotionAt: null, testStatus: "pending", regionSource: "sam" }, clock)).toBe("on battery, 40% · no movement seen yet · box found by SAM");
  expect(cameraLine({ status: "online", battery: null, charging: null, lastMotionAt: null, testStatus: "pending", regionSource: null }, clock)).toBe("no movement seen yet");
  expect(cameraLine({ status: "paused", battery: 0, charging: false, lastMotionAt: null, testStatus: "works" }, clock)).toBe("on battery, 0% · no movement seen yet");
});

test("the line counts today's movements once the phone has sent any", () => {
  const clock = () => "11:09 AM";
  expect(cameraLine({ status: "online", battery: null, charging: null, lastMotionAt: "2026-10-29T15:09:47Z", movementsToday: 3, regionSource: "hand" }, clock)).toBe("last movement 11:09 AM · 3 movements today · box set by hand");
  expect(cameraLine({ status: "online", battery: null, charging: null, lastMotionAt: "2026-10-29T15:09:47Z", movementsToday: 1, regionSource: null }, clock)).toBe("last movement 11:09 AM · 1 movement today");
  expect(cameraLine({ status: "online", battery: null, charging: null, lastMotionAt: null, movementsToday: 0, regionSource: null }, clock)).toBe("no movement seen yet");
});
