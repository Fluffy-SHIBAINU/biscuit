import { expect, test } from "vitest";
import { makeLetter, pickTemplate, TEMPLATES, textOf } from "../scripts/synth/letters.js";
import { photoPage } from "../scripts/synth/photo.js";
import { normalizeExtraction } from "../server/meta/spark.js";
import { matchHospital, statesFromText } from "../server/hospitals.js";
import { MIN_WORDS } from "../server/read.js";
import { normalize, verifyFacts } from "../server/verify.js";

// Synthetic letters: the truth is built from the same values the page prints, so the production verifier must accept every quote.
const seeds = Array.from({ length: 120 }, (_, i) => i + 1);
const us = (d: string) => { const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(d)!; return new Date(`${m[3]}-${m[1]}-${m[2]}T00:00:00Z`).getTime(); };

test("a letter is deterministic for its seed and differs across seeds", () => {
  expect(makeLetter(7)).toEqual(makeLetter(7));
  expect(makeLetter(8).transcription).not.toBe(makeLetter(7).transcription);
});

test("the transcription is the printed lines in reading order, and the page prints exactly those words", () => {
  for (const s of seeds.slice(0, 40)) {
    const l = makeLetter(s);
    expect(l.transcription).toBe(l.lines.join("\n"));
    expect(l.lines.length).toBeGreaterThanOrEqual(6);
    expect(l.transcription.split(/\s+/).length, `${l.template} seed ${s} clears the production word floor`).toBeGreaterThanOrEqual(MIN_WORDS);
    expect(normalize(textOf(l.html))).toBe(normalize(l.transcription));
  }
});

test("every quote in the truth is a verbatim line of the page: the production verifier accepts all of them", () => {
  for (const s of seeds) {
    const l = makeLetter(s);
    const facts = verifyFacts(normalizeExtraction(l.truth), l.transcription);
    expect(facts.length, `${l.template} has facts`).toBeGreaterThan(0);
    for (const f of facts) expect(f.verified, `${l.template} seed ${s}: ${f.field} "${f.quote}"`).toBe(true);
  }
});

test("bills come from a CMS hospital that the production matcher resolves to its own record", () => {
  let bills = 0;
  for (const s of seeds) {
    const l = makeLetter(s);
    if (l.kind !== "bill") continue;
    bills++;
    expect(l.hospital).not.toBeNull();
    expect(l.truth.hospital_name?.value).toBe(l.hospital!.name);
    if (l.template !== "bill_collection") expect(l.truth.sender?.value).toBe(l.hospital!.name);
    expect(matchHospital(l.truth.hospital_name!.value, l.template === "bill_collection" ? [l.hospital!.state] : statesFromText(l.transcription))?.ccn).toBe(l.hospital!.ccn);
    expect(l.truth.amount_due?.value).toMatch(/^\$\d{1,3}(,\d{3})*\.\d{2}$/);
    if (l.truth.account_last4) expect(l.truth.account_last4.value).toMatch(/^\d{4}$/);
    if (l.truth.statement_date) expect(l.truth.statement_date.value).toMatch(/^\d{2}\/\d{2}\/\d{4}$/);
    if (l.truth.due_date) expect(l.truth.due_date.value).toMatch(/^\d{2}\/\d{2}\/\d{4}$/);
    if (l.truth.due_date && l.truth.statement_date) expect(us(l.truth.due_date.value)).toBeGreaterThan(us(l.truth.statement_date.value));
  }
  expect(bills).toBeGreaterThan(30);
});

test("120 seeds cover every kind and every template", () => {
  expect([...new Set(seeds.map((s) => makeLetter(s).kind))].sort()).toEqual(["ad", "bill", "notice", "other", "utility"]);
  expect(new Set(seeds.map((s) => pickTemplate(s))).size).toBe(TEMPLATES.length);
});

test("account_last4 is the last four digits of the printed account line; every phone value is printed", () => {
  for (const s of seeds) {
    const l = makeLetter(s);
    const acct = l.truth.account_last4;
    if (acct) expect(acct.quote.replace(/\D/g, "").endsWith(acct.value)).toBe(true);
    for (const p of l.truth.phone_numbers) expect(l.transcription).toContain(p.value);
  }
});

test("financial assistance is cited only when the page speaks of it", () => {
  let cited = 0, denied = 0;
  for (const s of seeds) {
    const l = makeLetter(s);
    const fa = l.truth.financial_assistance;
    if (fa) { cited++; if (!fa.value) denied++; expect(l.transcription.toLowerCase()).toContain("financial assistance"); }
    else expect(l.transcription.toLowerCase()).not.toContain("financial assistance");
  }
  expect(cited).toBeGreaterThan(20);
  expect(denied).toBeGreaterThan(0);
});

test("a template can be forced; letters that are not from a hospital name none", () => {
  const u = makeLetter(3, "utility");
  expect(u.template).toBe("utility");
  expect(u.kind).toBe("utility");
  expect(u.hospital).toBeNull();
  expect(u.truth.hospital_name).toBeNull();
  expect(u.truth.amount_due).not.toBeNull();
  const a = makeLetter(3, "ad");
  expect(a.kind).toBe("ad");
  expect(a.truth.amount_due).toBeNull();
  expect(a.truth.account_last4).toBeNull();
});

test("the photo page wraps the letter in a tilted, lit, noisy frame of the asked size, deterministically", () => {
  const l = makeLetter(5);
  const page = photoPage(l, 5, { w: 1500, h: 2000 }, "photo");
  expect(page).toContain(l.html);
  expect(page).toMatch(/perspective\(/);
  expect(page).toMatch(/feTurbulence/);
  expect(page).toContain("width: 1500px");
  expect(page).toContain("height: 2000px");
  const angles = [...page.matchAll(/rotate[XYZ]\((-?\d+(?:\.\d+)?)deg\)/g)].map((m) => Number(m[1]));
  expect(angles).toHaveLength(3);
  for (const a of angles) expect(Math.abs(a)).toBeLessThanOrEqual(7);
  expect(photoPage(l, 5, { w: 1500, h: 2000 }, "photo")).toBe(page);
  expect(photoPage(l, 6, { w: 1500, h: 2000 }, "photo")).not.toBe(page);
});

// Round two: letters that lack things, pages that are not letters, and more than one way to photograph a page.
import { FAMILIES, familyFor } from "../scripts/synth/photo.js";

const many = Array.from({ length: 600 }, (_, i) => i + 1).map((s) => makeLetter(s));

test("twelve templates, and a letter can lack an account number, a due date, a date or a phone number", () => {
  expect(TEMPLATES).toHaveLength(12);
  for (const t of ["bill_collection", "notice_not_bill", "notice_msn", "ad_flyer", "other_page"]) expect(TEMPLATES).toContain(t);
  const bills = many.filter((l) => l.template === "bill_statement");
  expect(bills.filter((l) => !l.truth.account_last4).length).toBeGreaterThan(5);
  expect(bills.filter((l) => !l.truth.due_date).length).toBeGreaterThan(5);
  expect(bills.filter((l) => !l.truth.statement_date).length).toBeGreaterThan(3);
  expect(many.filter((l) => l.truth.phone_numbers.length === 0).length).toBeGreaterThan(20);
  for (const l of many) for (const f of verifyFacts(normalizeExtraction(l.truth), l.transcription)) expect(f.verified, `${l.template} ${l.seed} ${f.field}`).toBe(true);
});

test("every amount on every page is money, never NaN", () => {
  for (const l of many) {
    for (const line of l.lines) expect(line, `${l.template} ${l.seed}`).not.toMatch(/NaN|undefined|null/);
    if (l.truth.amount_due) expect(l.truth.amount_due.value).toMatch(/^\$\d{1,3}(,\d{3})*\.\d{2}$/);
  }
});

test("a page that is not a letter names its sender and nothing else", () => {
  const pages = many.filter((l) => l.template === "other_page" || l.template === "ad_flyer");
  expect(pages.length).toBeGreaterThan(20);
  for (const l of pages) {
    expect(l.truth.sender).not.toBeNull();
    expect(l.truth.amount_due).toBeNull();
    expect(l.truth.due_date).toBeNull();
    expect(l.truth.account_last4).toBeNull();
    expect(l.truth.hospital_name).toBeNull();
    expect(l.transcription.split(/\s+/).length).toBeGreaterThanOrEqual(MIN_WORDS);
  }
});

test("a statement that is not a bill lists charges but owes nothing; a Medicare notice names the facility and what may be billed", () => {
  const nb = many.filter((l) => l.template === "notice_not_bill");
  expect(nb.length).toBeGreaterThan(15);
  for (const l of nb) { expect(l.kind).toBe("notice"); expect(l.truth.amount_due).toBeNull(); expect(l.transcription).toMatch(/THIS IS NOT A BILL/); expect(l.truth.hospital_name).not.toBeNull(); }
  const msn = many.filter((l) => l.template === "notice_msn");
  expect(msn.length).toBeGreaterThan(15);
  for (const l of msn) { expect(l.kind).toBe("notice"); expect(l.truth.sender?.value).toBe("Centers for Medicare & Medicaid Services"); expect(l.truth.hospital_name).not.toBeNull(); expect(l.truth.amount_due?.quote).toMatch(/^Total You May Be Billed/); expect(l.hospital).not.toBeNull(); }
  const col = many.filter((l) => l.template === "bill_collection");
  expect(col.length).toBeGreaterThan(15);
  for (const l of col) { expect(l.kind).toBe("bill"); expect(l.truth.sender?.value).not.toBe(l.truth.hospital_name?.value); expect(l.hospital).not.toBeNull(); expect(l.truth.amount_due).not.toBeNull(); }
});

test("a redacted line is a black bar on the page and absent from the transcription", () => {
  const redacted = many.filter((l) => l.redacted.length > 0);
  expect(redacted.length).toBeGreaterThan(20);
  for (const l of redacted) {
    expect(l.html).toContain('class="bar"');
    for (const line of l.redacted) expect(l.lines).not.toContain(line);
    for (const f of verifyFacts(normalizeExtraction(l.truth), l.transcription)) expect(f.verified).toBe(true);
  }
});

test("three photo families, chosen by seed, each a different page", () => {
  expect(FAMILIES).toEqual(["photo", "scan", "fax"]);
  const seen = new Set(Array.from({ length: 200 }, (_, i) => familyFor(i + 1)));
  expect(seen.size).toBe(3);
  const l = makeLetter(5);
  const photo = photoPage(l, 5, { w: 1500, h: 2000 }, "photo"), scan = photoPage(l, 5, { w: 1500, h: 2000 }, "scan"), fax = photoPage(l, 5, { w: 1500, h: 2000 }, "fax");
  expect(new Set([photo, scan, fax]).size).toBe(3);
  expect(scan).toMatch(/grayscale\(/);
  expect(scan).not.toMatch(/perspective\(/);
  expect(fax).toMatch(/Courier/);
  for (const page of [photo, scan, fax]) expect(page).toContain(l.html.slice(-80));
});

// From the simulated user trial: the truth names the addressee, and appointment times are real times.
test("a letter with a patient block names its addressee unless the block is redacted; appointment times read as clock times", () => {
  let named = 0;
  for (const l of many) {
    const hasBlock = ["bill_statement", "bill_final", "bill_collection", "notice_fap", "notice_not_bill", "notice_msn", "other_appointment", "other_results", "utility"].includes(l.template);
    if (!hasBlock) { expect(l.truth.addressee).toBeNull(); continue; }
    if (l.redacted.length) { expect(l.truth.addressee).toBeNull(); continue; }
    expect(l.truth.addressee, `${l.template} ${l.seed}`).not.toBeNull();
    expect(l.transcription).toContain(l.truth.addressee!.value);
    named++;
    if (l.template === "other_appointment") for (const m of l.transcription.matchAll(/\b(\d{1,2}):(\d{2}) (AM|PM)\b/g)) { const h = Number(m[1]); expect(h).toBeGreaterThanOrEqual(1); expect(h).toBeLessThanOrEqual(12); }
  }
  expect(named).toBeGreaterThan(300);
});

