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

test("frame checks have their own budget", async () => {
  const app = createApp({ lookup: linked, events, frameLimiter: async () => false, sam: { detect: async () => [] } });
  expect((await post(app, "/api/biscuit/letter/frame", new Uint8Array(jpeg))).status).toBe(429);
});

// The second reader: both run side by side; Rosa hears only what both read the same way.
const transcription2: string = fx("spark-transcribe").choices[0].message.content;
const extraction2 = JSON.parse(fx("spark-extract").choices[0].message.content);
const recorder = () => { const calls: any[] = []; return { calls, events: { count: async () => 0, record: async (_h: string, _d: string | null, kind: string, data: any) => { calls.push({ kind, data }); return 1; } } }; };

test("both readers agree: read twice, every fact agreed, the lines as before", async () => {
  const { calls, events: ev } = recorder();
  const app = createApp({ lookup: linked, events: ev, sheet: async () => null, spark: { transcribe: async () => transcription2, extract: async () => extraction2 }, reader2: { transcribe: async () => transcription2, extract: async () => extraction2 } });
  const body = await (await post(app, "/api/biscuit/letter/read", new Uint8Array(jpeg))).json();
  expect(body.readBy).toBe("twice");
  expect(body.readers.map((r: any) => [r.name, r.status])).toEqual([["meta", "ok"], ["fireworks", "ok"]]);
  expect(body.facts.filter((f: any) => f.verified).every((f: any) => f.agreement === "agreed" && f.spoken)).toBe(true);
  expect(body.checks).toEqual([]);
  expect(body.lines[0]).toBe("This is from Massachusetts General Hospital.");
  expect(body.lines).toContain("The amount due is $1,850.00.");
  expect(calls[0]).toMatchObject({ kind: "letter_read", data: { readBy: "twice", differ: 0 } });
  expect(calls[0].data.readers[1]).toMatchObject({ name: "fireworks", status: "ok" });
});

test("the readers differ on the statement date: not spoken, both quotes kept, Ana will check", async () => {
  const t2 = transcription2.replace("10/03/2026", "10/08/2026");
  const x2 = { ...extraction2, statement_date: { value: "10/08/2026", quote: "Statement Date: 10/08/2026" } };
  const app = createApp({ lookup: linked, events, sheet: async () => null, spark: { transcribe: async () => transcription2, extract: async () => extraction2 }, reader2: { transcribe: async () => t2, extract: async () => x2 } });
  const body = await (await post(app, "/api/biscuit/letter/read", new Uint8Array(jpeg))).json();
  expect(body.readBy).toBe("twice");
  expect(body.facts.find((f: any) => f.field === "statement_date")).toMatchObject({ agreement: "differ", spoken: false, other: { value: "10/08/2026" } });
  expect(body.lines.some((l: string) => /statement date is/.test(l))).toBe(false);
  expect(body.lines).toContain("The statement date I read two ways, so I won't say it. Ana will check.");
  expect(body.checks).toEqual([{ field: "statement_date", quotes: [{ reader: "meta", value: "10/03/2026", quote: "10/03/2026" }, { reader: "fireworks", value: "10/08/2026", quote: "Statement Date: 10/08/2026" }] }]);
});

test("the second reader times out: read once by Meta, the status says so", async () => {
  const app = createApp({ lookup: linked, events, sheet: async () => null, readTimeoutMs: 40, spark: { transcribe: async () => transcription2, extract: async () => extraction2 }, reader2: { transcribe: () => new Promise((r) => setTimeout(() => r(transcription2), 500)), extract: async () => extraction2 } });
  const body = await (await post(app, "/api/biscuit/letter/read", new Uint8Array(jpeg))).json();
  expect(body.readBy).toBe("once");
  expect(body.readers).toEqual([expect.objectContaining({ name: "meta", status: "ok" }), expect.objectContaining({ name: "fireworks", status: "timeout" })]);
  expect(body.lines).toContain("The amount due is $1,850.00.");
  expect(body.facts.find((f: any) => f.field === "amount_due")).toMatchObject({ agreement: "once", spoken: true });
});

test("Meta fails and Fireworks answers: read once by Fireworks, the hospital still matched", async () => {
  const app = createApp({ lookup: linked, events, sheet: async () => null, spark: { transcribe: async () => { throw new Error("meta down"); }, extract: async () => extraction2 }, reader2: { transcribe: async () => transcription2, extract: async () => extraction2 } });
  const body = await (await post(app, "/api/biscuit/letter/read", new Uint8Array(jpeg))).json();
  expect(body.readBy).toBe("once");
  expect(body.readers[0]).toMatchObject({ name: "meta", status: "failed", error: "meta down" });
  expect(body.hospital).toMatchObject({ ccn: "220071" });
  expect(body.lines[0]).toBe("This is from Massachusetts General Hospital.");
});

test("both readers fail: 503, nothing recorded; an unreadable page is still 422", async () => {
  const { calls, events: ev } = recorder();
  const down = { transcribe: async () => { throw new Error("down"); }, extract: async () => extraction2 };
  const app = createApp({ lookup: linked, events: ev, spark: down, reader2: down });
  const res = await post(app, "/api/biscuit/letter/read", new Uint8Array(jpeg));
  expect(res.status).toBe(503);
  expect(await res.json()).toEqual({ error: "readers_down" });
  expect(calls).toEqual([]);
  const short = createApp({ lookup: linked, events: ev, spark: { transcribe: async () => "Hi", extract: async () => extraction2 }, reader2: down });
  expect((await post(short, "/api/biscuit/letter/read", new Uint8Array(jpeg))).status).toBe(422);
});

test("no second reader configured: single, no agreement fields, today's lines", async () => {
  const app = createApp({ lookup: linked, events, sheet: async () => null, spark: { transcribe: async () => transcription2, extract: async () => extraction2 }, reader2: null });
  const body = await (await post(app, "/api/biscuit/letter/read", new Uint8Array(jpeg))).json();
  expect(body.readBy).toBe("single");
  expect(body.readers).toEqual([expect.objectContaining({ name: "meta", status: "ok" })]);
  expect(body.facts.every((f: any) => f.agreement === undefined)).toBe(true);
  expect(body.lines).toContain("The statement date is 10/03/2026.");
});
