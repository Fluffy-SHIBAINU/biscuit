import { expect, test } from "vitest";
import { shouldGreet } from "../src/lib/greeting.js";

// The hello is for a page that has nothing else to say: a page that already spoke (the mail chime, a letter's title)
// must not have its words cut by "Hello! Biscuit here." when the ear comes on a moment later.
test("Biscuit greets once, when the ear is on and nothing has been said yet on this load", () => {
  expect(shouldGreet({ greeted: false, earOn: true, spoke: false })).toBe(true);
  expect(shouldGreet({ greeted: false, earOn: false, spoke: false })).toBe(false);
  expect(shouldGreet({ greeted: true, earOn: true, spoke: false })).toBe(false);
  expect(shouldGreet({ greeted: false, earOn: true, spoke: true })).toBe(false);
});
