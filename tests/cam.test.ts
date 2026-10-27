import { readFileSync } from "node:fs";
import { expect, test } from "vitest";
import { createApp } from "../server/app.js";
import { bestDetection, padRegion } from "../server/cam.js";

test("padRegion grows and clamps", () => {
  expect(padRegion({ x: 0.5, y: 0.5, w: 0.2, h: 0.1 })).toEqual({ x: 0.46, y: 0.48, w: 0.28, h: 0.14 });
  const r = padRegion({ x: 0, y: 0, w: 0.2, h: 0.1 });
  expect(r.x).toBe(0);
  expect(r.y).toBe(0);
  expect(padRegion({ x: 0.9, y: 0.9, w: 0.1, h: 0.1 }).x + padRegion({ x: 0.9, y: 0.9, w: 0.1, h: 0.1 }).w).toBeLessThanOrEqual(1);
});

test("bestDetection", () => {
  expect(bestDetection([{ box: { x: 0, y: 0, w: 1, h: 1 }, score: 0.4 }])).toBeNull();
  expect(bestDetection([{ box: { x: 0, y: 0, w: 1, h: 1 }, score: 0.6 }, { box: { x: 0, y: 0, w: 0.5, h: 0.5 }, score: 0.9 }])?.score).toBe(0.9);
});

const jpeg = readFileSync(new URL("./fixtures/mailbox.jpg", import.meta.url));
const linked = async () => ({ device: { id: "d1", householdId: "h1", kind: "cam" } as any, household: { id: "h1", called: "Rosa", language: "en" } as any });
const post = (app: any, body: Record<string, string>) => {
  const form = new FormData();
  form.set("image", new Blob([jpeg as unknown as BlobPart], { type: "image/jpeg" }), "m.jpg");
  for (const [k, v] of Object.entries(body)) form.set(k, v);
  return app.request("/api/biscuit/cam/find", { method: "POST", body: form, headers: { authorization: "Bearer x" } });
};

test("cam/find returns the best box for a text prompt and 404 when nothing scores", async () => {
  const prompts: any[] = [];
  const app = createApp({ lookup: linked, sam: { detect: async (_j, p) => { prompts.push(p); return "text" in p ? [{ box: { x: 0.16, y: 0.52, w: 0.48, h: 0.24 }, score: 0.8 }] : []; } } });
  const res = await post(app, { prompt: "mailbox" });
  expect(res.status).toBe(200);
  expect(await res.json()).toEqual({ box: { x: 0.16, y: 0.52, w: 0.48, h: 0.24 }, score: 0.8 });
  const miss = await post(app, { point: "0.5,0.5" });
  expect(miss.status).toBe(404);
  expect(prompts[1]).toEqual({ point: { x: 0.5, y: 0.5 } });
});

import { allowSamCall } from "../server/cam.js";

test("allowSamCall", () => {
  expect(allowSamCall({ samCallsToday: 399, samDay: "2026-10-27" }, "2026-10-27")).toBe(true);
  expect(allowSamCall({ samCallsToday: 400, samDay: "2026-10-27" }, "2026-10-27")).toBe(false);
  expect(allowSamCall({ samCallsToday: 400, samDay: "2026-10-26" }, "2026-10-27")).toBe(true);
  expect(allowSamCall({ samCallsToday: 0, samDay: null }, "2026-10-27")).toBe(true);
});
