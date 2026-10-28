import { existsSync, readFileSync } from "node:fs";
import { expect, test } from "vitest";
import { DEFAULT_MODEL, extractFactsFw, transcribeLetterFw } from "../server/fireworks/spark.js";

// Recorded replies from the default Fireworks reader (npx tsx scripts/record-fixtures.ts fireworks). Skipped until they exist.
const dir = new URL("./fixtures/fireworks/", import.meta.url);
const have = existsSync(new URL("transcribe.json", dir)) && existsSync(new URL("extract.json", dir));
const fx = (name: string) => JSON.parse(readFileSync(new URL(`${name}.json`, dir), "utf8"));
const jpeg = readFileSync(new URL("./fixtures/letter-synthetic.jpg", import.meta.url));

test.skipIf(!have)("the Fireworks reader transcribes the bill and carries quotes", async () => {
  expect(fx("transcribe").model).toBe(DEFAULT_MODEL);
  const text = await transcribeLetterFw(jpeg, async () => fx("transcribe"));
  expect(text).toContain("1,850.00");
  const x = await extractFactsFw(text, async () => fx("extract"));
  expect(x.kind).toBe("bill");
  expect(x.amount_due?.value.replace(/[^0-9.]/g, "")).toBe("1850.00");
  expect(text.replace(/\s+/g, " ")).toContain(x.amount_due!.quote.replace(/\s+/g, " "));
});
