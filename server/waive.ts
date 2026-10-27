export const WAIVE_BASE = process.env.WAIVE_BASE_URL || "https://waive.kindred-ai.dev";

export type SheetSummary = {
  ccn: string;
  hospital: string;
  freeCare: { maxFpl: string; quote: string; sourceUrl: string | null; checkedOn: string | null } | null;
  decisionDays: number | null;
  ecaWaitDays: number | null;
  phone: string | null;
  checkedOn: string;
  url: string;
};

type Cited = { value?: unknown; quote?: string | null; source_id?: string | null; checked_on?: string | null } | null | undefined;

const str = (v: unknown): string | null => (v === null || v === undefined || v === "" ? null : String(v));
const num = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : typeof v === "string" && /^\d+$/.test(v) ? Number(v) : null);

export function sheetUrl(ccn: string): string {
  return `${WAIVE_BASE}/atlas/${encodeURIComponent(ccn)}`;
}

export function startUrl(ccn: string): string {
  return `${WAIVE_BASE}/start?ccn=${encodeURIComponent(ccn)}`;
}

/** The slice of a Waive sheet Biscuit speaks: the free-care rule with its quote and source, the phone, two waits. */
export function summarizeSheet(raw: any, ccn: string): SheetSummary {
  const sources: { id?: string; url?: string | null }[] = Array.isArray(raw?.sources) ? raw.sources : [];
  const urlOf = (sourceId: unknown) => sources.find((s) => s.id === sourceId)?.url ?? null;
  const fc: Cited = raw?.eligibility?.free_care_max_fpl;
  const phone: Cited = raw?.contacts?.phone;
  const decision: Cited = raw?.apply?.decision_days;
  const eca: Cited = raw?.collections?.eca_wait_days;
  const checkedOn = str(fc?.checked_on) ?? str(phone?.checked_on) ?? str(raw?.version?.created_at) ?? "";
  return {
    ccn: str(raw?.hospital?.ccn) ?? ccn,
    hospital: titleCase(str(raw?.hospital?.name) ?? ""),
    freeCare: fc && str(fc.value) && fc.quote ? { maxFpl: String(fc.value), quote: fc.quote, sourceUrl: urlOf(fc.source_id), checkedOn: str(fc.checked_on) } : null,
    decisionDays: num(decision?.value),
    ecaWaitDays: num(eca?.value),
    phone: str(phone?.value),
    checkedOn,
    url: sheetUrl(ccn),
  };
}

export function titleCase(s: string): string {
  return s.toLowerCase().replace(/\b([a-z])([a-z']*)/g, (m, a, rest, i) => (i > 0 && ["of", "and", "the", "at", "for"].includes(m) ? m : a.toUpperCase() + rest));
}

export type Fetcher = (url: string) => Promise<Response>;

/** Waive's published sheet for a CCN, or null when Waive has none (404). Other failures throw. */
export async function fetchSheet(ccn: string, fetcher: Fetcher = (u) => fetch(u, { headers: { accept: "application/json" } })): Promise<SheetSummary | null> {
  const res = await fetcher(`${sheetUrl(ccn)}.json`);
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`waive ${res.status}`);
  return summarizeSheet(await res.json(), ccn);
}
