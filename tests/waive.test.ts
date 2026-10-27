import { readFileSync } from "node:fs";
import { expect, test } from "vitest";
import { fetchSheet, startUrl, summarizeSheet } from "../server/waive.js";

const fixture = JSON.parse(readFileSync(new URL("./fixtures/waive-sheet.json", import.meta.url), "utf8"));

test("summarizeSheet reads the free care rule with its quote and source", () => {
  const s = summarizeSheet(fixture, "220071");
  expect(s.ccn).toBe("220071");
  expect(s.hospital).toMatch(/Massachusetts General/i);
  expect(s.freeCare?.maxFpl).toBe("150");
  expect(s.freeCare?.quote).toBe("Family Income % FPG Discount 0 to 150% 100%");
  expect(s.freeCare?.sourceUrl).toMatch(/^https:\/\//);
  expect(s.phone).toBe("617-726-3884");
  expect(s.checkedOn).toBe("2026-10-03");
  expect(s.url).toBe("https://waive.kindred-ai.dev/atlas/220071");
});

test("summarizeSheet survives a sheet without eligibility", () => {
  const s = summarizeSheet({ hospital: { name: "X" }, sources: [] }, "1");
  expect(s.freeCare).toBeNull();
  expect(s.phone).toBeNull();
  expect(s.decisionDays).toBeNull();
});

test("fetchSheet returns null on 404 and the summary on 200", async () => {
  expect(await fetchSheet("000000", async () => new Response("", { status: 404 }))).toBeNull();
  const s = await fetchSheet("220071", async () => new Response(JSON.stringify(fixture), { status: 200, headers: { "content-type": "application/json" } }));
  expect(s?.freeCare?.maxFpl).toBe("150");
  expect(startUrl("220071")).toBe("https://waive.kindred-ai.dev/start?ccn=220071");
});
