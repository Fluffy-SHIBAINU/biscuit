import { expect, test } from "vitest";
import { fitLongSide } from "../src/lib/camera.js";

test("fitLongSide", () => {
  expect(fitLongSide(4000, 3000, 2000)).toEqual({ w: 2000, h: 1500 });
  expect(fitLongSide(1000, 800, 2000)).toEqual({ w: 1000, h: 800 });
  expect(fitLongSide(3000, 4000, 1280)).toEqual({ w: 960, h: 1280 });
});
