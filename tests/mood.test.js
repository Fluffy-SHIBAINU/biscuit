import { expect, test } from "vitest";
import { moodOf, titleOf } from "../src/lib/mood.js";

// One word for the dog and the bar, in the bar's old order of precedence.
test("moodOf follows the bar's precedence", () => {
  const base = { wanted: true, earPaused: false, status: "on", muted: false, phase: "idle", level: 0, earMuted: false };
  expect(moodOf({ ...base, wanted: false })).toBe("off");
  expect(moodOf({ ...base, status: "paused" })).toBe("paused");
  expect(moodOf({ ...base, wanted: false, earPaused: true })).toBe("paused");
  expect(moodOf({ ...base, status: "blocked" })).toBe("blocked");
  expect(moodOf({ ...base, status: "asleep" })).toBe("asleep");
  expect(moodOf({ ...base, status: "looking" })).toBe("looking");
  expect(moodOf({ ...base, muted: true, phase: "speaking" })).toBe("muted");
  expect(moodOf({ ...base, status: "held" })).toBe("talking");
  expect(moodOf({ ...base, status: "starting" })).toBe("waking");
  expect(moodOf({ ...base, phase: "speaking" })).toBe("talking");
  expect(moodOf({ ...base, earMuted: true })).toBe("talking");
  expect(moodOf({ ...base, phase: "thinking" })).toBe("thinking");
  expect(moodOf({ ...base, level: 1 })).toBe("hearing");
  expect(moodOf(base)).toBe("listening");
  expect(titleOf("thinking")).toBe("One Moment");
  expect(titleOf("blocked", "unsupported")).toBe("This Phone Can't Hear");
  expect(titleOf("hearing")).toBe("Biscuit Is Listening");
});
