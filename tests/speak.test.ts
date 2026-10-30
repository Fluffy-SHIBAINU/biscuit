import { expect, test } from "vitest";
import { createApp } from "../server/app.js";

// A neural voice when the household's server has one (TTS_URL, a Baseten Kokoro deployment): the phone asks for a line's audio
// and plays it; without one, or when it fails, the phone's own voice speaks. Nothing about the line is kept.
const linked = async () => ({ device: { id: "d1", householdId: "h1", kind: "rosa" } as any, household: { id: "h1", called: "Rosa", language: "en" } as any });
const wav = Buffer.from("RIFF....WAVEfmt ");
const headers = { authorization: "Bearer x", "content-type": "application/json" };

test("without TTS_URL the phone is told to use its own voice, and a request for audio is 503", async () => {
  const app = createApp({ lookup: linked, ttsEnv: {} });
  expect(await (await app.request("/api/biscuit/speak/voice", { headers })).json()).toEqual({ neural: false });
  expect((await app.request("/api/biscuit/speak", { method: "POST", headers, body: JSON.stringify({ text: "Hello." }) })).status).toBe(503);
});

test("with TTS_URL the audio comes back as a WAV, the request carries the voice and the key, and the text is bounded", async () => {
  const calls: any[] = [];
  const fetcher = (async (url: string, init: any) => { calls.push({ url, init }); return new Response(JSON.stringify({ output: wav.toString("base64") }), { status: 200, headers: { "content-type": "application/json" } }); }) as any;
  const app = createApp({ lookup: linked, ttsEnv: { TTS_URL: "https://model-abc.api.baseten.co/environments/production/predict", TTS_API_KEY: "k1", TTS_VOICE: "am_michael" }, ttsFetch: fetcher });
  expect(await (await app.request("/api/biscuit/speak/voice", { headers })).json()).toEqual({ neural: true });
  const res = await app.request("/api/biscuit/speak", { method: "POST", headers, body: JSON.stringify({ text: "You've got mail, Rosa. " + "x".repeat(2000) }) });
  expect(res.status).toBe(200);
  expect(res.headers.get("content-type")).toContain("audio/wav");
  expect(Buffer.from(await res.arrayBuffer()).equals(wav)).toBe(true);
  expect(calls).toHaveLength(1);
  expect(calls[0].url).toBe("https://model-abc.api.baseten.co/environments/production/predict");
  expect(calls[0].init.headers.authorization).toBe("Api-Key k1");
  const body = JSON.parse(calls[0].init.body);
  expect(body.voice).toBe("am_michael");
  expect(body.text.length).toBeLessThanOrEqual(600);
  expect((await app.request("/api/biscuit/speak", { method: "POST", headers, body: JSON.stringify({ text: "" }) })).status).toBe(400);
});

test("a provider that answers raw audio or an audio field is understood; a failure is 503 and the phone falls back", async () => {
  const raw = (async () => new Response(wav, { status: 200, headers: { "content-type": "audio/wav" } })) as any;
  const app1 = createApp({ lookup: linked, ttsEnv: { TTS_URL: "https://x/predict", TTS_API_KEY: "k" }, ttsFetch: raw });
  const r1 = await app1.request("/api/biscuit/speak", { method: "POST", headers, body: JSON.stringify({ text: "Hi." }) });
  expect(r1.status).toBe(200);
  expect(Buffer.from(await r1.arrayBuffer()).equals(wav)).toBe(true);
  const field = (async () => new Response(JSON.stringify({ audio: wav.toString("base64") }), { status: 200, headers: { "content-type": "application/json" } })) as any;
  const app2 = createApp({ lookup: linked, ttsEnv: { TTS_URL: "https://x/predict", TTS_API_KEY: "k" }, ttsFetch: field });
  expect((await app2.request("/api/biscuit/speak", { method: "POST", headers, body: JSON.stringify({ text: "Hi." }) })).status).toBe(200);
  const failing = (async () => new Response("boom", { status: 500 })) as any;
  const app3 = createApp({ lookup: linked, ttsEnv: { TTS_URL: "https://x/predict", TTS_API_KEY: "k" }, ttsFetch: failing });
  expect((await app3.request("/api/biscuit/speak", { method: "POST", headers, body: JSON.stringify({ text: "Hi." }) })).status).toBe(503);
});
