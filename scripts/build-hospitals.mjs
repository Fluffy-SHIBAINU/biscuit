// Builds server/data/hospitals.json from the CMS Hospital General Information dataset (public data).
import { writeFileSync } from "node:fs";

const DATASET = "xubh-q36u";
const URL_BASE = `https://data.cms.gov/provider-data/api/1/datastore/query/${DATASET}/0`;
const LIMIT = 500;
const SMALL = new Set(["of", "and", "the", "at", "for", "in", "on"]);

function titleCase(s) {
  return s.toLowerCase().replace(/\b([a-z])([a-z']*)/g, (m, a, rest, i) => (i > 0 && SMALL.has(m) ? m : a.toUpperCase() + rest)).replace(/\bLlc\b/g, "LLC").replace(/\bInc\b/g, "Inc");
}

const rows = [];
for (let offset = 0; ; offset += LIMIT) {
  const res = await fetch(`${URL_BASE}?limit=${LIMIT}&offset=${offset}`, { headers: { "user-agent": "Mozilla/5.0 (Biscuit by Kindred AI; hello@kindred-ai.dev)", accept: "application/json" } });
  if (!res.ok) throw new Error(`CMS ${res.status}`);
  const json = await res.json();
  const page = json.results ?? [];
  for (const r of page) rows.push({ ccn: r.facility_id, name: titleCase(r.facility_name), city: titleCase(r.citytown ?? ""), state: r.state });
  process.stdout.write(`\r${rows.length} rows`);
  if (page.length < LIMIT) break;
}
rows.sort((a, b) => a.ccn.localeCompare(b.ccn));
writeFileSync("server/data/hospitals.json", JSON.stringify(rows));
console.log(`\nwrote ${rows.length} hospitals`);
