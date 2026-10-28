export const FIREWORKS_BASE = "https://api.fireworks.ai/inference/v1";

export function fireworksKey(): string {
  const key = process.env.FIREWORKS_API_KEY;
  if (!key) throw new Error("FIREWORKS_API_KEY is not set");
  return key;
}

export type FireworksLog = { model: string; path: string; ms: number; status?: number; inputTokens?: number; outputTokens?: number };

/** One line per model call: model, path, latency, tokens. Never a body. */
export function logFireworks(entry: FireworksLog): void {
  console.log(JSON.stringify({ fireworks: entry }));
}

export async function fireworksFetch(path: string, init: RequestInit & { timeoutMs?: number } = {}, fetcher: typeof fetch = fetch): Promise<Response> {
  const { timeoutMs = 30_000, headers, ...rest } = init;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetcher(`${FIREWORKS_BASE}${path}`, {
      ...rest,
      headers: { authorization: `Bearer ${fireworksKey()}`, ...(headers as Record<string, string> | undefined) },
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timer);
  }
}
