import OpenAI from "openai";

export const META_BASE = "https://api.meta.ai/v1";

export function metaKey(): string {
  const key = process.env.MODEL_API_KEY;
  if (!key) throw new Error("MODEL_API_KEY is not set");
  return key;
}

export type MetaLog = { model: string; path: string; ms: number; status?: number; inputTokens?: number; outputTokens?: number };

/** One line per model call: model, path, latency, tokens. Never a body. */
export function logMeta(entry: MetaLog): void {
  console.log(JSON.stringify({ meta: entry }));
}

export async function metaFetch(path: string, init: RequestInit & { timeoutMs?: number } = {}): Promise<Response> {
  const { timeoutMs = 30_000, headers, ...rest } = init;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(`${META_BASE}${path}`, {
      ...rest,
      headers: { authorization: `Bearer ${metaKey()}`, ...(headers as Record<string, string> | undefined) },
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timer);
  }
}

export function openai(): OpenAI {
  return new OpenAI({ baseURL: META_BASE, apiKey: metaKey() });
}

export function dataUrl(bytes: Buffer, mime = "image/jpeg"): string {
  return `data:${mime};base64,${bytes.toString("base64")}`;
}
