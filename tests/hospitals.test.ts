import { expect, test } from "vitest";
import { matchHospital, normalizeName } from "../server/hospitals.js";

test("exact name", () => expect(matchHospital("Massachusetts General Hospital", "MA")?.ccn).toBe("220071"));
test("short form scores high enough", () => expect(matchHospital("Mass General Hospital", "MA")?.ccn).toBe("220071"));
test("a stranger returns null", () => expect(matchHospital("Rosa's Bakery", "MA")).toBeNull());
test("a near miss returns null", () => expect(matchHospital("General Hospital", "MA")).toBeNull());
test("normalizeName strips punctuation and case", () => expect(normalizeName("St. Luke's-Roosevelt  Hospital")).toBe("st lukes roosevelt hospital"));

import { statesFromText } from "../server/hospitals.js";
test("duplicate names across states return null without a state", () => {
  expect(matchHospital("Mercy Hospital")).toBeNull();
  expect(matchHospital("Massachusetts General Hospital")?.ccn).toBe("220071");
});
test("statesFromText collects distinct states next to ZIP codes", () => {
  expect(statesFromText("Somerville, MA 02143 and Boston, MA 02114")).toEqual(["MA"]);
  expect(statesFromText("Nashua, NH 03060 ... Lowell, MA 01852")).toEqual(["NH", "MA"]);
});
test("several candidate states still need a unique name", () => {
  expect(matchHospital("Mercy Hospital", ["CA", "MN"])).toBeNull();
  expect(matchHospital("Mercy Hospital", ["ME", "CA"])?.state).toBe("CA");
});
