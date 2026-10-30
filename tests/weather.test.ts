import { expect, test } from "vitest";
import { geocode, weatherLine } from "../server/weather.js";

// Open-Meteo, no key: the place is looked up once and the weather read as one plain sentence for the prompt and for Rosa.
test("weatherLine turns Open-Meteo's current and daily values into one sentence in Fahrenheit", async () => {
  const fetcher = (async (url: string) => {
    expect(url).toContain("latitude=42.36");
    expect(url).toContain("temperature_unit=fahrenheit");
    return new Response(JSON.stringify({ current: { temperature_2m: 58.4, weather_code: 1 }, daily: { temperature_2m_max: [64.2], temperature_2m_min: [47.1], precipitation_probability_max: [10] } }), { status: 200 });
  }) as any;
  expect(await weatherLine(42.36, -71.06, fetcher)).toBe("Mostly sunny, 58 now, high 64, low 47, rain unlikely.");
  const rainy = (async () => new Response(JSON.stringify({ current: { temperature_2m: 50, weather_code: 61 }, daily: { temperature_2m_max: [52], temperature_2m_min: [44], precipitation_probability_max: [80] } }), { status: 200 })) as any;
  expect(await weatherLine(42.36, -71.06, rainy)).toBe("Rain, 50 now, high 52, low 44, rain likely.");
  const down = (async () => new Response("x", { status: 500 })) as any;
  expect(await weatherLine(42.36, -71.06, down)).toBeNull();
});

test("geocode finds a place by name and returns its coordinates and a short label", async () => {
  const fetcher = (async (url: string) => { expect(url).toContain("name=Boston"); return new Response(JSON.stringify({ results: [{ name: "Boston", admin1: "Massachusetts", country_code: "US", latitude: 42.3584, longitude: -71.0598 }] }), { status: 200 }); }) as any;
  expect(await geocode("Boston", fetcher)).toEqual({ label: "Boston, Massachusetts", lat: 42.3584, lon: -71.0598 });
  const none = (async () => new Response(JSON.stringify({}), { status: 200 })) as any;
  expect(await geocode("Nowhereville", none)).toBeNull();
});
