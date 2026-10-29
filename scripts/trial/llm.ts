// Two OpenAI-format chat endpoints for the trial: Fireworks (DeepSeek V4.1 Flash, no reasoning tokens) for the personas,
// Baseten (another model family) for the report, so the judge is not the same model as the crowd.
export type Provider = "fireworks" | "baseten";
export type Chat = (messages: { role: string; content: string }[], opts?: { json?: boolean; maxTokens?: number; temperature?: number }) => Promise<string>;

const ENDPOINTS: Record<Provider, { base: string; key: () => string; auth: (k: string) => string; model: () => string; extra: Record<string, unknown> }> = {
  fireworks: { base: "https://api.fireworks.ai/inference/v1", key: () => process.env.FIREWORKS_API_KEY ?? "", auth: (k) => `Bearer ${k}`, model: () => process.env.TRIAL_FIREWORKS_MODEL || "accounts/fireworks/models/deepseek-v4p1-flash", extra: { reasoning_effort: "none" } },
  baseten: { base: "https://inference.baseten.co/v1", key: () => process.env.BASETEN_API_KEY ?? "", auth: (k) => `Api-Key ${k}`, model: () => process.env.TRIAL_BASETEN_MODEL || "zai-org/GLM-5.3", extra: {} },
};

export function chatFor(provider: Provider, fetcher: typeof fetch = fetch): Chat {
  const e = ENDPOINTS[provider];
  return async (messages, opts = {}) => {
    const key = e.key();
    if (!key) throw new Error(`${provider}: no API key in the environment`);
    let lastErr: unknown = null;
    for (let attempt = 0; attempt < 3; attempt++) {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 120_000);
      try {
        const res = await fetcher(`${e.base}/chat/completions`, {
          method: "POST", signal: controller.signal,
          headers: { authorization: e.auth(key), "content-type": "application/json" },
          body: JSON.stringify({ model: e.model(), messages, temperature: opts.temperature ?? 0.8, max_tokens: opts.maxTokens ?? 1500, ...(opts.json ? { response_format: { type: "json_object" } } : {}), ...e.extra }),
        });
        const json: any = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(`${provider} ${res.status}: ${JSON.stringify(json?.error ?? json).slice(0, 200)}`);
        const c = json?.choices?.[0]?.message?.content;
        const text = typeof c === "string" ? c : Array.isArray(c) ? c.map((p: any) => p?.text ?? "").join("") : "";
        console.log(JSON.stringify({ trial: { provider, model: e.model(), inputTokens: json?.usage?.prompt_tokens, outputTokens: json?.usage?.completion_tokens } }));
        return text;
      } catch (err) {
        lastErr = err;
        await new Promise((r) => setTimeout(r, 1500 * (attempt + 1)));
      } finally { clearTimeout(timer); }
    }
    throw lastErr;
  };
}
