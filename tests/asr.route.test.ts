import { expect, test } from "vitest";
import { createApp } from "../server/app.js";
import { wavDurationMs } from "../server/routes/rosa.js";

const linked = async () => ({
  device: { id: "d1", householdId: "h1", kind: "rosa" } as any,
  household: { id: "h1", called: "Rosa", language: "en" } as any,
});

test("asr route rejects a clip over 2 MB", async () => {
  const app = createApp({ lookup: linked });
  const form = new FormData();
  form.set("audio", new Blob([new Uint8Array(2_100_000)], { type: "audio/wav" }), "a.wav");
  const res = await app.request("/api/biscuit/asr", { method: "POST", body: form, headers: { authorization: "Bearer x" } });
  expect(res.status).toBe(413);
});

test("asr route transcribes a short clip through the given transport", async () => {
  const app = createApp({ lookup: linked, asr: async () => "hello biscuit." });
  const form = new FormData();
  form.set("audio", new Blob([new Uint8Array(44 + 32000)], { type: "audio/wav" }), "a.wav");
  const res = await app.request("/api/biscuit/asr", { method: "POST", body: form, headers: { authorization: "Bearer x" } });
  expect(res.status).toBe(200);
  expect(await res.json()).toEqual({ text: "hello biscuit." });
});

test("wavDurationMs reads the data length against the rate", () => {
  const header = new Uint8Array(44);
  const v = new DataView(header.buffer);
  v.setUint32(24, 16000, true);
  v.setUint16(22, 1, true);
  v.setUint16(34, 16, true);
  v.setUint32(40, 32000, true);
  expect(wavDurationMs(Buffer.from(header))).toBe(1000);
});
