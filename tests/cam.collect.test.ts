import { readFileSync } from "node:fs";
import { expect, test } from "vitest";
import { createApp } from "../server/app.js";
import { COLLECT_PROMPTS, collectAllowed } from "../server/cam.js";

// Collect mode: a household whose owner is named by CAM_COLLECT_OWNER may keep its mailbox frames for calibration.
// The phone asks for it on every send; nothing is kept for anyone else, and nothing is kept when the phone does not ask.
const jpeg = readFileSync(new URL("./fixtures/mailbox.jpg", import.meta.url));
const linked = (ownerEmail: string) => async () => ({ device: { id: "d1", householdId: "h1", kind: "cam" } as any, household: { id: "h1", called: "Rosa", language: "en", ownerEmail } as any });
const post = (app: any, fields: Record<string, string>) => {
  const form = new FormData();
  form.set("frame1", new Blob([jpeg as unknown as BlobPart], { type: "image/jpeg" }), "f1.jpg");
  form.set("frame2", new Blob([jpeg as unknown as BlobPart], { type: "image/jpeg" }), "f2.jpg");
  for (const [k, v] of Object.entries(fields)) form.set(k, v);
  return app.request("/api/biscuit/cam/frames", { method: "POST", body: form, headers: { authorization: "Bearer x" } });
};

test("collectAllowed: only the named owner, only when the phone asks", () => {
  expect(collectAllowed({ CAM_COLLECT_OWNER: "ana@example.org" }, "ana@example.org", "1")).toBe(true);
  expect(collectAllowed({ CAM_COLLECT_OWNER: "Ana@Example.org" }, "ana@example.org", "1")).toBe(true);
  expect(collectAllowed({ CAM_COLLECT_OWNER: "ana@example.org" }, "ana@example.org", "")).toBe(false);
  expect(collectAllowed({ CAM_COLLECT_OWNER: "ana@example.org" }, "someone@example.org", "1")).toBe(false);
  expect(collectAllowed({}, "ana@example.org", "1")).toBe(false);
  expect(COLLECT_PROMPTS.length).toBeGreaterThanOrEqual(3);
});

test("in collect mode every prompt is scored on the first frame and the sample is kept with its scores", async () => {
  const kept: any[] = [];
  const prompts: string[] = [];
  const app = createApp({
    lookup: linked("ana@example.org"), camEnv: { CAM_COLLECT_OWNER: "ana@example.org" },
    camStore: { get: async () => ({ householdId: "h1", region: { x: 0, y: 0, w: 1, h: 1 }, paused: false, samCallsToday: 0, samDay: null, testStatus: "works" }) as any, update: async () => {}, keep: async (row: any) => { kept.push(row); return 1; }, attach: async () => true },
    sam: { detect: async (_j, p) => { if ("text" in p) prompts.push(p.text); return "text" in p && p.text === "envelope" ? [{ box: { x: 0.1, y: 0.1, w: 0.3, h: 0.2 }, score: 0.71 }] : []; } },
    events: { count: async () => 0, record: async () => 1 }, pushSend: async () => {},
  });
  const res = await post(app, { collect: "1", level: "17.5" });
  expect(res.status).toBe(200);
  const body = await res.json();
  expect(body.seen).toBe("envelope");
  expect(body.kept).toBe(true);
  expect(prompts.slice(0, COLLECT_PROMPTS.length)).toEqual([...COLLECT_PROMPTS]);
  expect(kept).toHaveLength(1);
  expect(kept[0]).toMatchObject({ householdId: "h1", deviceId: "d1", test: false, seen: "envelope", level: 17.5, scores: { envelope: 0.71 } });
  expect(kept[0].frames).toHaveLength(2);
  expect(kept[0].frames[0]).toMatch(/^data:image\/jpeg;base64,/);
  for (const p of COLLECT_PROMPTS) expect(kept[0].scores).toHaveProperty(p);
});

test("without the owner's permission nothing is kept and the normal path runs", async () => {
  const kept: any[] = [];
  const prompts: string[] = [];
  const mk = (env: Record<string, string>) => createApp({
    lookup: linked("ana@example.org"), camEnv: env,
    camStore: { get: async () => ({ householdId: "h1", region: { x: 0, y: 0, w: 1, h: 1 }, paused: false, samCallsToday: 0, samDay: null, testStatus: "works" }) as any, update: async () => {}, keep: async (row: any) => { kept.push(row); return 1; }, attach: async () => true },
    sam: { detect: async (_j, p) => { if ("text" in p) prompts.push(p.text); return []; } },
    events: { count: async () => 0, record: async () => 1 }, pushSend: async () => {},
  });
  let body = await (await post(mk({ CAM_COLLECT_OWNER: "other@example.org" }), { collect: "1" })).json();
  expect(body).toMatchObject({ seen: null });
  expect(body.kept).toBeUndefined();
  body = await (await post(mk({ CAM_COLLECT_OWNER: "ana@example.org" }), {})).json();
  expect(body.kept).toBeUndefined();
  expect(kept).toEqual([]);
  expect(prompts.length).toBe(12);
});

test("a sample that cannot be kept does not break the watch", async () => {
  const app = createApp({
    lookup: linked("ana@example.org"), camEnv: { CAM_COLLECT_OWNER: "ana@example.org" },
    camStore: { get: async () => ({ householdId: "h1", region: { x: 0, y: 0, w: 1, h: 1 }, paused: false, samCallsToday: 0, samDay: null, testStatus: "works" }) as any, update: async () => {}, keep: async () => { throw new Error("relation biscuit_cam_sample does not exist"); }, attach: async () => true },
    sam: { detect: async () => [] }, events: { count: async () => 0, record: async () => 1 }, pushSend: async () => {},
  });
  const res = await post(app, { collect: "1" });
  expect(res.status).toBe(200);
  expect(await res.json()).toEqual({ seen: null, callsToday: 9, gate: null, kept: false });
});
