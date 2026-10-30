import { Hono } from "hono";
import type { MiddlewareHandler } from "hono";
import type { AuthVars } from "../auth.js";
import { toPcm16Wav } from "../wav.js";

export const SPEAK_MAX_CHARS = 600;
export const DEFAULT_TTS_VOICE = "am_michael";

export const TTS_TIMEOUT_MS = 20_000;

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
  const target = () => env.TTS_URL?.trim() || "";
  return new Hono<AuthVars>()
    .get("/speak/voice", deps.auth, (c) => c.json({ neural: Boolean(target()) }))
    .post("/speak", deps.auth, async (c) => {
      const url = target();
      if (!url) return c.json({ error: "no_voice" }, 503);
      const b = await c.req.json().catch(() => ({}));
      const text = typeof b?.text === "string" ? b.text.trim().slice(0, SPEAK_MAX_CHARS) : "";
      if (!text) return c.json({ error: "no_text" }, 400);
      const key = env.TTS_API_KEY?.trim() || env.BASETEN_API_KEY?.trim() || "";
      const basic = env.TTS_BASIC_AUTH?.trim() || "";
      const provider = env.TTS_PROVIDER?.trim() === "openai" ? "openai" : "kokoro";
      const speed = Number(env.TTS_SPEED) || 1;
      const voice = env.TTS_VOICE?.trim() || DEFAULT_TTS_VOICE;
      const authorization = provider === "openai"
        ? (key ? `Bearer ${key}` : basic ? `Basic ${Buffer.from(basic).toString("base64")}` : "")
        : (key ? `Api-Key ${key}` : basic ? `Basic ${Buffer.from(basic).toString("base64")}` : "");
      const body = provider === "openai"
        ? { model: env.TTS_MODEL?.trim() || "tts-1", input: text, voice, response_format: "wav", speed }
        : { text, voice, speed };
      try {
        const res = await fetcher(url, {
          method: "POST",
          headers: { "content-type": "application/json", "ngrok-skip-browser-warning": "1", ...(authorization ? { authorization } : {}) },
          body: JSON.stringify(body),
          signal: AbortSignal.timeout(TTS_TIMEOUT_MS),
        });
        if (!res.ok) throw new Error(`tts ${res.status}`);
        const type = res.headers.get("content-type") || "";
        let bytes: Buffer;
        if (type.startsWith("audio/")) bytes = Buffer.from(await res.arrayBuffer());
        else {
          const json: any = await res.json();
          const b64 = json?.base64 ?? json?.output ?? json?.audio ?? json?.audio_base64 ?? json?.data;
          if (typeof b64 !== "string") throw new Error("tts shape");
          bytes = Buffer.from(b64.replace(/^data:audio\/\w+;base64,/, ""), "base64");
        }
        bytes = toPcm16Wav(bytes);
        return new Response(new Uint8Array(bytes), { headers: { "content-type": "audio/wav", "cache-control": "private, max-age=86400" } });
      } catch (err: any) {
        console.log(JSON.stringify({ tts: "failed", error: String(err?.message ?? err).slice(0, 120) }));
        return c.json({ error: "voice_failed" }, 503);
      }
    });
}
