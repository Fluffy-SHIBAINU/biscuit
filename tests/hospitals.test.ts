import { expect, test } from "vitest";
import { matchHospital, normalizeName } from "../server/hospitals.js";

test("exact name", () => expect(matchHospital("Massachusetts General Hospital", "MA")?.ccn).toBe("220071"));
test("short form scores high enough", () => expect(matchHospital("Mass General Hospital", "MA")?.ccn).toBe("220071"));
test("a stranger returns null", () => expect(matchHospital("Rosa's Bakery", "MA")).toBeNull());
test("a near miss returns null", () => expect(matchHospital("General Hospital", "MA")).toBeNull());
test("normalizeName strips punctuation and case", () => expect(normalizeName("St. Luke's-Roosevelt  Hospital")).toBe("st lukes roosevelt hospital"));
