import { Hono } from "hono";
import type { MiddlewareHandler } from "hono";
import type { AuthVars } from "../auth.js";
import { pcm16ToWav, toPcm16Wav } from "../wav.js";

export const SPEAK_MAX_CHARS = 600;
export const DEFAULT_TTS_VOICE = "am_michael";

export const TTS_TIMEOUT_MS = 20_000;
export const DEFAULT_GEMINI_TTS_MODEL = "gemini-3.8-flash-tts";
export const DEFAULT_TTS_STYLE = "Say this as a cheerful, warm, quick helper, a friendly border collie of a voice, clear for an older listener, at a moderate pace:";
const LINE_CACHE_MAX = 300;

/**
 * A neural voice for Biscuit when the server has one. TTS_URL names a text-to-speech endpoint; TTS_PROVIDER picks its shape:
 * "kokoro" (default; a Baseten Kokoro predict URL: {text, voice, speed} in, {"base64": wav} out) or "openai" (OpenAI's
 * /v1/audio/speech shape: {model, input, voice, response_format, speed} in, raw audio out; what VoiceStudio on the founder's
 * Mac speaks behind an ngrok tunnel). TTS_API_KEY signs with Bearer (openai) or Api-Key (kokoro); TTS_BASIC_AUTH ("user:pass")
 * signs a tunnel's basic auth instead. The phone asks for a line's audio and plays it; without a URL, or when the call fails or
 * takes too long, the phone's own voice speaks. Nothing about the line is kept.
 */
export function speakRoutes(deps: { auth: MiddlewareHandler<AuthVars>; env?: Record<string, string | undefined>; fetcher?: typeof fetch }) {
  const env = deps.env ?? process.env;
  const fetcher = deps.fetcher ?? fetch;
  const target = () => env.TTS_URL?.trim() || (env.TTS_PROVIDER?.trim() === "gemini" ? `https://generativelanguage.googleapis.com/v1beta/models/${env.TTS_MODEL?.trim() || DEFAULT_GEMINI_TTS_MODEL}:generateContent` : "");
  const keyFor = () => env.TTS_API_KEY?.trim() || (env.TTS_PROVIDER?.trim() === "gemini" ? env.GEMINI_API_KEY?.trim() : env.BASETEN_API_KEY?.trim()) || "";
  // Gemini needs its key before the phone is told to try the neural voice; otherwise every line would fail and fall back a second late.
  const ready = () => Boolean(target()) && (env.TTS_PROVIDER?.trim() !== "gemini" || Boolean(keyFor()));
  /** Repeated lines (greetings, questions, sign-offs) are served from memory on this instance; a letter's facts are rarely repeated and age out. */
  const lineCache = new Map<string, Buffer>();
  return new Hono<AuthVars>()
    .get("/speak/voice", deps.auth, (c) => c.json({ neural: ready() }))
    .post("/speak", deps.auth, async (c) => {
      const url = target();
      if (!url || !ready()) return c.json({ error: "no_voice" }, 503);

      const b = await c.req.json().catch(() => ({}));
      const text = typeof b?.text === "string" ? b.text.trim().slice(0, SPEAK_MAX_CHARS) : "";
      if (!text) return c.json({ error: "no_text" }, 400);
      const cacheKey = `${url}|${env.TTS_MODEL ?? ""}|${env.TTS_VOICE ?? ""}|${env.TTS_SPEED ?? ""}|${text}`;
      const cached = lineCache.get(cacheKey);
      if (cached) return new Response(new Uint8Array(cached), { headers: { "content-type": "audio/wav", "cache-control": "private, max-age=86400" } });
      const key = keyFor();
      const basic = env.TTS_BASIC_AUTH?.trim() || "";
      const provider = env.TTS_PROVIDER?.trim() === "openai" ? "openai" : env.TTS_PROVIDER?.trim() === "gemini" ? "gemini" : "kokoro";
      const speed = Number(env.TTS_SPEED) || 1;
      const voice = env.TTS_VOICE?.trim() || DEFAULT_TTS_VOICE;
      const authorization = provider === "openai"
        ? (key ? `Bearer ${key}` : basic ? `Basic ${Buffer.from(basic).toString("base64")}` : "")
        : (key ? `Api-Key ${key}` : basic ? `Basic ${Buffer.from(basic).toString("base64")}` : "");
      const style = env.TTS_STYLE?.trim() || DEFAULT_TTS_STYLE;
      const body = provider === "gemini"
        ? { contents: [{ parts: [{ text: `${style} ${text}` }] }], generationConfig: { responseModalities: ["AUDIO"], speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: voice } } } } }
        : provider === "openai"
          ? { model: env.TTS_MODEL?.trim() || "tts-1", input: text, voice, response_format: "wav", speed }
          : { text, voice, speed };
      const requestHeaders: Record<string, string> = provider === "gemini"
        ? { "content-type": "application/json", "x-goog-api-key": key }
        : { "content-type": "application/json", "ngrok-skip-browser-warning": "1", ...(authorization ? { authorization } : {}) };
      try {
        const res = await fetcher(url, { method: "POST", headers: requestHeaders, body: JSON.stringify(body), signal: AbortSignal.timeout(TTS_TIMEOUT_MS) });
        if (!res.ok) throw new Error(`tts ${res.status}`);
        const type = res.headers.get("content-type") || "";
        let bytes: Buffer;
        if (type.startsWith("audio/")) bytes = Buffer.from(await res.arrayBuffer());
        else if (provider === "gemini") {
          const json: any = await res.json();
          const part = json?.candidates?.[0]?.content?.parts?.find((p: any) => p?.inlineData?.data);
          if (!part) throw new Error("tts shape");
          const rate = Number(/rate=(\d+)/.exec(part.inlineData.mimeType || "")?.[1]) || 24000;
          bytes = pcm16ToWav(Buffer.from(part.inlineData.data, "base64"), rate);
        } else {
          const json: any = await res.json();
          const b64 = json?.base64 ?? json?.output ?? json?.audio ?? json?.audio_base64 ?? json?.data;
          if (typeof b64 !== "string") throw new Error("tts shape");
          bytes = Buffer.from(b64.replace(/^data:audio\/\w+;base64,/, ""), "base64");
        }
        bytes = toPcm16Wav(bytes);
        if (lineCache.size >= LINE_CACHE_MAX) lineCache.delete(lineCache.keys().next().value as string);
        lineCache.set(cacheKey, bytes);
        return new Response(new Uint8Array(bytes), { headers: { "content-type": "audio/wav", "cache-control": "private, max-age=86400" } });
      } catch (err: any) {
        console.log(JSON.stringify({ tts: "failed", error: String(err?.message ?? err).slice(0, 120) }));
        return c.json({ error: "voice_failed" }, 503);
      }
    });
}
