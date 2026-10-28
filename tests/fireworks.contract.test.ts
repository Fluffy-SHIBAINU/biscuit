import { existsSync, readFileSync } from "node:fs";
import { expect, test } from "vitest";
import { extractFactsFw, transcribeLetterFw } from "../server/fireworks/spark.js";

// Recorded Muse Spark Open replies (npx tsx scripts/record-fixtures.ts fireworks). Skipped until they exist.
const dir = new URL("./fixtures/fireworks/", import.meta.url);
const have = existsSync(new URL("spark-transcribe.json", dir)) && existsSync(new URL("spark-extract.json", dir));
const fx = (name: string) => JSON.parse(readFileSync(new URL(`${name}.json`, dir), "utf8"));
const jpeg = readFileSync(new URL("./fixtures/letter-synthetic.jpg", import.meta.url));

test.skipIf(!have)("Spark Open on Fireworks transcribes the bill and carries quotes", async () => {
  const text = await transcribeLetterFw(jpeg, async () => fx("spark-transcribe"));
  expect(text).toContain("1,850.00");
  const x = await extractFactsFw(text, async () => fx("spark-extract"));
  expect(x.kind).toBe("bill");
  expect(x.amount_due?.value.replace(/[^0-9.]/g, "")).toBe("1850.00");
  expect(text.replace(/\s+/g, " ")).toContain(x.amount_due!.quote.replace(/\s+/g, " "));
});
