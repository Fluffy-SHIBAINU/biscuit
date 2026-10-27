import { readFileSync } from "node:fs";
import { expect, test } from "vitest";
import { createApp } from "../server/app.js";

const fx = (name: string) => JSON.parse(readFileSync(new URL(`./fixtures/meta/${name}.json`, import.meta.url), "utf8"));
const jpeg = readFileSync(new URL("./fixtures/letter-synthetic.jpg", import.meta.url));
const linked = async () => ({ device: { id: "d1", householdId: "h1", kind: "rosa" } as any, household: { id: "h1", called: "Rosa", language: "en" } as any });
const events = { count: async () => 0, record: async () => 1 };
const post = (app: any, path: string, bytes: Uint8Array) => {
  const form = new FormData();
  form.set("image", new Blob([bytes as unknown as BlobPart], { type: "image/jpeg" }), "l.jpg");
  return app.request(path, { method: "POST", body: form, headers: { authorization: "Bearer x" } });
};

test("read route refuses a short page", async () => {
  const app = createApp({ lookup: linked, events, spark: { transcribe: async () => "Hi there", extract: async () => ({}) as any } });
  const res = await post(app, "/api/biscuit/letter/read", new Uint8Array(jpeg));
  expect(res.status).toBe(422);
  expect(await res.json()).toEqual({ error: "unreadable" });
});

test("read route returns the transcription and verified facts", async () => {
  const transcription: string = fx("spark-transcribe").choices[0].message.content;
  const extraction = JSON.parse(fx("spark-extract").choices[0].message.content);
  const app = createApp({ lookup: linked, events, sheet: async () => null, spark: { transcribe: async () => transcription, extract: async () => extraction } });
  const res = await post(app, "/api/biscuit/letter/read", new Uint8Array(jpeg));
  expect(res.status).toBe(200);
  const body = await res.json();
  expect(body.kind).toBe("bill");
  expect(body.transcription).toContain("Amount Due");
  expect(body.facts.find((f: any) => f.field === "amount_due")).toMatchObject({ value: "$1,850.00", verified: true });
  expect(body.hospital).toMatchObject({ ccn: "220071", name: "Massachusetts General Hospital" });
  expect(body.sheet).toBeNull();
  expect(body.offerLines).toEqual(["I can send this to Ana."]);
  expect(body.lines[0]).toBe("This is from Massachusetts General Hospital.");
});

test("read route refuses a picture over 2 MB and the rate limit", async () => {
  const app = createApp({ lookup: linked, events: { count: async () => 20, record: async () => 1 }, spark: { transcribe: async () => "x", extract: async () => ({}) as any } });
  expect((await post(app, "/api/biscuit/letter/read", new Uint8Array(2_100_000))).status).toBe(413);
  expect((await post(app, "/api/biscuit/letter/read", new Uint8Array(jpeg))).status).toBe(429);
});

test("frame route reports the check", async () => {
  const app = createApp({ lookup: linked, events, sam: { detect: async () => [{ box: { x: 0.1, y: 0.1, w: 0.7, h: 0.7 }, score: 0.9 }] } });
  const res = await post(app, "/api/biscuit/letter/frame", new Uint8Array(jpeg));
  expect(res.status).toBe(200);
  expect(await res.json()).toEqual({ ok: true, coverage: 0.49, cutEdge: null });
});

test("a letter from nobody on record that asks for a call is flagged", async () => {
  const transcription = Array.from({ length: 50 }, (_, i) => `word${i}`).join(" ") + " Medicare Rewards Department call 888-555-0199 today";
  const extraction = { kind: "notice", sender: { value: "Medicare Rewards Department", quote: "Medicare Rewards Department" }, hospital_name: null, amount_due: null, statement_date: null, due_date: null, financial_assistance: null, phone_numbers: [{ value: "888-555-0199", quote: "call 888-555-0199" }], account_last4: null };
  const app = createApp({ lookup: linked, events, sheet: async () => null, spark: { transcribe: async () => transcription, extract: async () => extraction as any } });
  const body = await (await post(app, "/api/biscuit/letter/read", new Uint8Array(jpeg))).json();
  expect(body.hospital).toBeNull();
  expect(body.unknownNumber).toBe(true);
  expect(body.offerLines[0]).toMatch(/^This asks you to call a number I don't know/);
});
