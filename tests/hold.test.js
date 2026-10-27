import { expect, test, vi } from "vitest";
import { holdToHelp } from "../src/lib/hold.js";

test("holdToHelp fires after two seconds of holding and not on a short tap", () => {
  vi.useFakeTimers();
  const handlers = {};
  const el = { addEventListener: (n, f) => { handlers[n] = f; }, removeEventListener: (n) => { delete handlers[n]; } };
  const fired = [];
  const unbind = holdToHelp(el, () => fired.push(1));
  handlers.pointerdown({ preventDefault() {} });
  vi.advanceTimersByTime(1500);
  handlers.pointerup({});
  expect(fired).toHaveLength(0);
  handlers.pointerdown({ preventDefault() {} });
  vi.advanceTimersByTime(2000);
  expect(fired).toHaveLength(1);
  unbind();
  expect(Object.keys(handlers)).toHaveLength(0);
  vi.useRealTimers();
});

