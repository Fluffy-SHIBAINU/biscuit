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
    expect(l.truth.sender?.value).toBe(l.hospital!.name);
    expect(matchHospital(l.truth.hospital_name!.value, statesFromText(l.transcription))?.ccn).toBe(l.hospital!.ccn);
    expect(l.truth.amount_due?.value).toMatch(/^\$\d{1,3}(,\d{3})*\.\d{2}$/);
    expect(l.truth.account_last4?.value).toMatch(/^\d{4}$/);
    expect(l.truth.statement_date?.value).toMatch(/^\d{2}\/\d{2}\/\d{4}$/);
    expect(l.truth.due_date?.value).toMatch(/^\d{2}\/\d{2}\/\d{4}$/);
    expect(us(l.truth.due_date!.value)).toBeGreaterThan(us(l.truth.statement_date!.value));
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
    expect(l.truth.phone_numbers.length).toBeGreaterThan(0);
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
  const page = photoPage(l, 5, { w: 1500, h: 2000 });
  expect(page).toContain(l.html);
  expect(page).toMatch(/perspective\(/);
  expect(page).toMatch(/feTurbulence/);
  expect(page).toContain("width: 1500px");
  expect(page).toContain("height: 2000px");
  const angles = [...page.matchAll(/rotate[XYZ]\((-?\d+(?:\.\d+)?)deg\)/g)].map((m) => Number(m[1]));
  expect(angles).toHaveLength(3);
  for (const a of angles) expect(Math.abs(a)).toBeLessThanOrEqual(7);
  expect(photoPage(l, 5, { w: 1500, h: 2000 })).toBe(page);
  expect(photoPage(l, 6, { w: 1500, h: 2000 })).not.toBe(page);
});
