// The weather for Rosa's home, from Open-Meteo (no key, no account): one plain sentence in Fahrenheit for Biscuit's prompt and
// for when she asks. The place is looked up once, by name, when she or Ana says where home is.

const WORDS: [number[], string][] = [
  [[0], "Clear"], [[1], "Mostly sunny"], [[2], "Partly cloudy"], [[3], "Overcast"], [[45, 48], "Foggy"],
  [[51, 53, 55, 56, 57], "Drizzle"], [[61, 63, 65, 66, 67, 80, 81, 82], "Rain"], [[71, 73, 75, 77, 85, 86], "Snow"], [[95, 96, 99], "Thunderstorms"],
];
const words = (code: number) => WORDS.find(([codes]) => codes.includes(code))?.[1] ?? "Changeable";

export async function weatherLine(lat: number, lon: number, fetcher: typeof fetch = fetch): Promise<string | null> {
  const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=temperature_2m,weather_code&daily=temperature_2m_max,temperature_2m_min,precipitation_probability_max&temperature_unit=fahrenheit&forecast_days=1&timezone=auto`;
  try {
    const res = await fetcher(url, { signal: AbortSignal.timeout(2500) });
    if (!res.ok) return null;
    const j: any = await res.json();
    const now = Math.round(j?.current?.temperature_2m), code = Number(j?.current?.weather_code ?? -1);
    const hi = Math.round(j?.daily?.temperature_2m_max?.[0]), lo = Math.round(j?.daily?.temperature_2m_min?.[0]);
    const rain = Number(j?.daily?.precipitation_probability_max?.[0] ?? 0);
    if (![now, hi, lo].every(Number.isFinite)) return null;
    return `${words(code)}, ${now} now, high ${hi}, low ${lo}, rain ${rain >= 50 ? "likely" : rain >= 25 ? "possible" : "unlikely"}.`;
  } catch { return null; }
}

export async function geocode(name: string, fetcher: typeof fetch = fetch): Promise<{ label: string; lat: number; lon: number } | null> {
  const url = `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(name.trim())}&count=1&language=en&format=json`;
  try {
    const res = await fetcher(url, { signal: AbortSignal.timeout(2500) });
    if (!res.ok) return null;
    const j: any = await res.json();
    const r = j?.results?.[0];
    if (!r || !Number.isFinite(r.latitude) || !Number.isFinite(r.longitude)) return null;
    return { label: [r.name, r.admin1].filter(Boolean).join(", "), lat: r.latitude, lon: r.longitude };
  } catch { return null; }
}
