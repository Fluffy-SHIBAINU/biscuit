import { expect, test } from "vitest";
import { createApp } from "../server/app.js";
import { toPcm16Wav } from "../server/wav.js";

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

// Kokoro on Baseten answers {"base64": <WAV>} with 32-bit float samples at 24 kHz; phones play 16-bit PCM everywhere, so the route converts.
function floatWav(samples: number[], rate = 24000): Buffer {
  const data = Buffer.alloc(samples.length * 4);
  samples.forEach((v, i) => data.writeFloatLE(v, i * 4));
  const h = Buffer.alloc(44);
  h.write("RIFF", 0); h.writeUInt32LE(36 + data.length, 4); h.write("WAVE", 8); h.write("fmt ", 12); h.writeUInt32LE(16, 16);
  h.writeUInt16LE(3, 20); h.writeUInt16LE(1, 22); h.writeUInt32LE(rate, 24); h.writeUInt32LE(rate * 4, 28); h.writeUInt16LE(4, 32); h.writeUInt16LE(32, 34);
  h.write("data", 36); h.writeUInt32LE(data.length, 40);
  return Buffer.concat([h, data]);
}
test("toPcm16Wav turns a float WAV into 16-bit PCM and leaves a PCM WAV alone", () => {
  const out = toPcm16Wav(floatWav([0, 0.5, -0.5, 1, -1.5]));
  expect(out.toString("ascii", 0, 4)).toBe("RIFF");
  expect(out.readUInt16LE(20)).toBe(1);
  expect(out.readUInt16LE(34)).toBe(16);
  expect(out.readUInt32LE(24)).toBe(24000);
  expect(out.readUInt32LE(40)).toBe(10);
  expect(out.readInt16LE(44)).toBe(0);
  expect(out.readInt16LE(46)).toBe(16383);
  expect(out.readInt16LE(48)).toBe(-16384);
  expect(out.readInt16LE(50)).toBe(32767);
  expect(out.readInt16LE(52)).toBe(-32768);
  const pcm = Buffer.from(out);
  expect(toPcm16Wav(pcm).equals(pcm)).toBe(true);
  expect(toPcm16Wav(Buffer.from("not a wav")).toString()).toBe("not a wav");
});
test("the base64 key Kokoro uses is understood", async () => {
  const field = (async () => new Response(JSON.stringify({ base64: wav.toString("base64") }), { status: 200, headers: { "content-type": "application/json" } })) as any;
  const app = createApp({ lookup: linked, ttsEnv: { TTS_URL: "https://x/predict", TTS_API_KEY: "k" }, ttsFetch: field });
  const r = await app.request("/api/biscuit/speak", { method: "POST", headers, body: JSON.stringify({ text: "Hi." }) });
  expect(r.status).toBe(200);
  expect(Buffer.from(await r.arrayBuffer()).equals(wav)).toBe(true);
});

// VoiceStudio on the founder's Mac speaks OpenAI's speech API behind an ngrok tunnel: TTS_PROVIDER=openai sends model, input,
// voice, response_format wav and speed, signs with Bearer or with the tunnel's basic auth, and gets raw WAV back.
test("the openai provider sends OpenAI's speech request and signs with the tunnel's basic auth", async () => {
  const calls: any[] = [];
  const fetcher = (async (url: string, init: any) => { calls.push({ url, init }); return new Response(wav, { status: 200, headers: { "content-type": "audio/wav" } }); }) as any;
  const app = createApp({ lookup: linked, ttsEnv: { TTS_URL: "https://biscuit-voice.ngrok-free.app/v1/audio/speech", TTS_PROVIDER: "openai", TTS_MODEL: "mlx-audio", TTS_VOICE: "am_michael", TTS_BASIC_AUTH: "biscuit:s3cret", TTS_SPEED: "1.05" }, ttsFetch: fetcher });
  const res = await app.request("/api/biscuit/speak", { method: "POST", headers, body: JSON.stringify({ text: "Woof! Mail's here, Rosa." }) });
  expect(res.status).toBe(200);
  expect(Buffer.from(await res.arrayBuffer()).equals(wav)).toBe(true);
  const body = JSON.parse(calls[0].init.body);
  expect(body).toEqual({ model: "mlx-audio", input: "Woof! Mail's here, Rosa.", voice: "am_michael", response_format: "wav", speed: 1.05 });
  expect(calls[0].init.headers.authorization).toBe("Basic " + Buffer.from("biscuit:s3cret").toString("base64"));
  expect(calls[0].init.headers["ngrok-skip-browser-warning"]).toBe("1");
});

test("the openai provider prefers a bearer key when one is set, and the default provider is still Kokoro's shape", async () => {
  const calls: any[] = [];
  const fetcher = (async (url: string, init: any) => { calls.push({ url, init }); return new Response(wav, { status: 200, headers: { "content-type": "audio/wav" } }); }) as any;
  const app = createApp({ lookup: linked, ttsEnv: { TTS_URL: "https://x/v1/audio/speech", TTS_PROVIDER: "openai", TTS_API_KEY: "k9" }, ttsFetch: fetcher });
  await app.request("/api/biscuit/speak", { method: "POST", headers, body: JSON.stringify({ text: "Hi." }) });
  expect(calls[0].init.headers.authorization).toBe("Bearer k9");
  expect(JSON.parse(calls[0].init.body).model).toBe("tts-1");
  const app2 = createApp({ lookup: linked, ttsEnv: { TTS_URL: "https://x/predict", TTS_API_KEY: "k" }, ttsFetch: fetcher });
  await app2.request("/api/biscuit/speak", { method: "POST", headers, body: JSON.stringify({ text: "Hi." }) });
  expect(JSON.parse(calls[1].init.body)).toEqual({ text: "Hi.", voice: "am_michael", speed: 1 });
});

// Gemini text-to-speech (the production voice): generateContent with AUDIO out, a style prefix, a prebuilt voice; base64 PCM at
// 24 kHz comes back and leaves as a 16-bit WAV. Repeated lines are served from memory.
test("the gemini provider asks for audio with a style prefix and a voice, wraps the PCM, and caches a repeated line", async () => {
  const calls: any[] = [];
  const pcm = Buffer.alloc(8); pcm.writeInt16LE(1000, 0); pcm.writeInt16LE(-1000, 2);
  const fetcher = (async (url: string, init: any) => { calls.push({ url, init }); return new Response(JSON.stringify({ candidates: [{ content: { parts: [{ inlineData: { mimeType: "audio/L16;codec=pcm;rate=24000", data: pcm.toString("base64") } }] } }] }), { status: 200, headers: { "content-type": "application/json" } }); }) as any;
  const app = createApp({ lookup: linked, ttsEnv: { TTS_PROVIDER: "gemini", TTS_API_KEY: "g1", TTS_VOICE: "Puck", TTS_MODEL: "gemini-3.8-flash-tts" }, ttsFetch: fetcher });
  expect(await (await app.request("/api/biscuit/speak/voice", { headers })).json()).toEqual({ neural: true });
  const res = await app.request("/api/biscuit/speak", { method: "POST", headers, body: JSON.stringify({ text: "Woof! Mail's here, Rosa." }) });
  expect(res.status).toBe(200);
  const out = Buffer.from(await res.arrayBuffer());
  expect(out.toString("ascii", 0, 4)).toBe("RIFF");
  expect(out.readUInt32LE(24)).toBe(24000);
  expect(out.readUInt16LE(34)).toBe(16);
  expect(out.readInt16LE(44)).toBe(1000);
  expect(calls[0].url).toBe("https://generativelanguage.googleapis.com/v1beta/models/gemini-3.8-flash-tts:generateContent");
  expect(calls[0].init.headers["x-goog-api-key"]).toBe("g1");
  const body = JSON.parse(calls[0].init.body);
  expect(body.contents[0].parts[0].text).toMatch(/cheerful.*Woof! Mail's here, Rosa\.$/s);
  expect(body.generationConfig.responseModalities).toEqual(["AUDIO"]);
  expect(body.generationConfig.speechConfig.voiceConfig.prebuiltVoiceConfig.voiceName).toBe("Puck");
  const again = await app.request("/api/biscuit/speak", { method: "POST", headers, body: JSON.stringify({ text: "Woof! Mail's here, Rosa." }) });
  expect(again.status).toBe(200);
  expect(calls).toHaveLength(1);
});
