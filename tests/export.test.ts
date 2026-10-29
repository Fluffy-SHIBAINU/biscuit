import { expect, test } from "vitest";
import { deidentify, exportRows, type ExportSample } from "../scripts/cam/export.js";

// The export for the overall model: labelled clips only, the household id hashed, no device, the hour not the minute,
// the box-region crops as files beside a JSONL of labels and scores.
const H1 = "7e4c1c1e-0b1a-4b6b-9c3b-1f2e3d4c5b6a", H2 = "0a1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d";
const jpeg = `data:image/jpeg;base64,${Buffer.from("abc").toString("base64")}`;
const row = (o: Partial<ExportSample>): ExportSample => ({ id: 1, householdId: H1, deviceId: "dev-1", at: new Date("2026-10-29T15:42:10Z"), test: false, clip: true, level: 17.5, seen: "envelope", scores: { envelope: 0.71 }, frames: [jpeg, jpeg], label: "carrier", labelledAt: new Date("2026-10-29T16:00:00Z"), ...o });

test("labelled clips become de-identified rows and crop files; skipped, unlabelled and test-run samples are left out", () => {
  const { rows, files } = exportRows([row({ id: 1 }), row({ id: 2, label: "skip" }), row({ id: 3, label: null }), row({ id: 4, test: true }), row({ id: 5, householdId: H2, label: "nothing", frames: [jpeg] })]);
  expect(rows).toHaveLength(2);
  expect(files).toHaveLength(3);
  expect(rows[0]).toEqual({ household: deidentify(H1), sample: 1, at: "2026-10-29T15:00:00.000Z", label: "carrier", positive: true, level: 17.5, seen: "envelope", scores: { envelope: 0.71 }, frames: [`${deidentify(H1)}/1-1.jpg`, `${deidentify(H1)}/1-2.jpg`] });
  expect(rows[1]).toMatchObject({ household: deidentify(H2), sample: 5, label: "nothing", positive: false, frames: [`${deidentify(H2)}/5-1.jpg`] });
  for (const r of rows) {
    expect(r).not.toHaveProperty("householdId");
    expect(r).not.toHaveProperty("deviceId");
    expect(r).not.toHaveProperty("labelledAt");
    expect(JSON.stringify(r)).not.toContain(H1);
  }
  expect(files[0]).toEqual({ path: `${deidentify(H1)}/1-1.jpg`, data: Buffer.from("abc") });
});

test("the household hash is stable, short, and not the id", () => {
  expect(deidentify(H1)).toBe(deidentify(H1));
  expect(deidentify(H1)).toMatch(/^[0-9a-f]{16}$/);
  expect(deidentify(H1)).not.toBe(deidentify(H2));
  expect(H1).not.toContain(deidentify(H1));
});
