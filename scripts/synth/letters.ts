// Synthetic letters for training and evaluating Biscuit's readers. Biscuit keeps no letters, so it writes its own: every
// page is built from values the generator chose, and the truth (the production Extraction shape) is built from the same
// values, so each quote is a verbatim printed line. Hospitals are real CMS records (server/data/hospitals.json); patients,
// addresses, amounts, account numbers and phone numbers are invented (phones use the fictional 555-01xx range).
import hospitals from "../../server/data/hospitals.json" with { type: "json" };
import { matchHospital, type Hospital } from "../../server/hospitals.js";
import type { Extraction, LetterKind } from "../../server/meta/spark.js";
import { mulberry32, type Rng } from "./rng.js";

export const TEMPLATES = ["bill_statement", "bill_final", "notice_fap", "utility", "ad", "other_appointment", "other_results"] as const;
export type TemplateId = (typeof TEMPLATES)[number];
const WEIGHTS: Record<TemplateId, number> = { bill_statement: 25, bill_final: 15, notice_fap: 15, utility: 15, ad: 15, other_appointment: 8, other_results: 7 };
const KIND: Record<TemplateId, LetterKind> = { bill_statement: "bill", bill_final: "bill", notice_fap: "notice", utility: "utility", ad: "ad", other_appointment: "other", other_results: "other" };

export type Style = { font: string; size: number; band: string | null; accent: string };
export type Synth = { id: string; seed: number; template: TemplateId; kind: LetterKind; lines: string[]; transcription: string; truth: Extraction; hospital: Hospital | null; html: string; style: Style };

/** The day the generator counts from, fixed so a seed always gives the same dates. */
export const TODAY = Date.UTC(2026, 9, 28);
const DAY = 86_400_000;

const ZIP3: Record<string, string> = { AL: "350", AK: "995", AZ: "850", AR: "720", CA: "900", CO: "800", CT: "060", DE: "197", DC: "200", FL: "330", GA: "300", HI: "968", ID: "832", IL: "600", IN: "460", IA: "500", KS: "660", KY: "400", LA: "700", ME: "040", MD: "210", MA: "021", MI: "480", MN: "550", MS: "390", MO: "630", MT: "590", NE: "680", NV: "890", NH: "030", NJ: "070", NM: "870", NY: "100", NC: "270", ND: "580", OH: "430", OK: "730", OR: "970", PA: "150", RI: "028", SC: "290", SD: "570", TN: "370", TX: "750", UT: "840", VT: "050", VA: "220", WA: "980", WV: "250", WI: "530", WY: "820", PR: "009", VI: "008", GU: "969" };
const FIRST = ["Rosa", "Harold", "Mabel", "Walter", "Dolores", "Eugene", "Lorraine", "Marvin", "Beatrice", "Clarence", "Gloria", "Vernon", "Thelma", "Leonard", "Irene", "Norman", "Ethel", "Raymond", "Phyllis", "Chester", "Josefina", "Ignacio", "Yolanda", "Ramon", "Mei", "Fatima", "Dorothy", "Ernest", "Agnes", "Soon-ok"];
const LAST = ["Alvarez", "Johnson", "Nakamura", "Okafor", "Patel", "Kowalski", "O'Brien", "Lindqvist", "Garcia", "Washington", "Kim", "Park", "Chen", "Rodriguez", "Bennett", "Fischer", "Haddad", "Delgado", "Morrison", "Thompson", "Nguyen", "Jackson", "Russo", "Santos"];
const STREETS = ["Linden Street", "Maple Avenue", "Oak Lane", "Cedar Court", "Elm Street", "Birch Road", "Washington Avenue", "Lake Drive", "Hillcrest Road", "Park Place", "Spring Street", "Church Street", "Mill Road", "Prospect Street", "Grove Avenue", "Sunset Boulevard", "Harbor View Drive"];
const DEPTS = ["Patient Financial Services", "Patient Accounts", "Billing Department", "Business Office", "Patient Business Services"];
const AREA = [617, 206, 212, 312, 415, 713, 305, 404, 602, 503, 215, 216, 414, 612, 303, 702, 801, 919, 704, 614, 410, 860, 401, 207, 802, 603, 920, 501, 405, 918, 505, 406, 701, 605, 307, 208, 775, 808, 907, 787];
const SERVICES = ["Emergency department visit, level 4", "CT scan, abdomen and pelvis", "Laboratory panel", "Chest X-ray, two views", "Office visit, established patient", "Physical therapy, 45 minutes", "MRI, lumbar spine, without contrast", "Pharmacy", "Observation, per hour", "Echocardiogram", "Mammogram, screening", "Ultrasound, abdomen", "Cardiology consult", "Venipuncture", "Infusion, first hour"];
const UTILITIES = [["Northwind Electric Cooperative", "Electricity used", "kWh"], ["Riverside Water District", "Water used", "gallons"], ["Evergreen Natural Gas", "Gas used", "therms"], ["Harbor Light & Power", "Electricity used", "kWh"], ["Prairie Rural Electric Association", "Electricity used", "kWh"], ["Lakeside Municipal Utilities", "Water used", "gallons"]] as const;
const ADS = [
  ["ClearTone Hearing Centers", "Free hearing screening for seniors this month", ["Trouble following conversations in a noisy room?", "Our licensed specialists test your hearing at no charge and explain the results in plain words.", "Rechargeable hearing aids now start at $899 a pair."]],
  ["SilverGuard Medical Alert", "Help at the press of a button, day or night", ["One press reaches a trained operator in seconds.", "No landline needed. Works in the shower and the garden.", "First month free for new customers."]],
  ["Horizon Medicare Advantage Plans", "Your plan choices for next year", ["$0 monthly premium plans may be available in your county.", "Dental, vision and hearing coverage included on select plans.", "A licensed agent can review your options over the phone."]],
  ["BrightSmile Dental Savings Plan", "Save 20 to 50 percent at the dentist", ["No waiting periods, no annual limits, no claim forms.", "Join today and use your plan tomorrow.", "Plans from $12.95 a month."]],
  ["ComfortStep Mobility", "Stay independent at home", ["Lift chairs, walkers and scooters delivered to your door.", "Ask about Medicare coverage for qualifying equipment.", "Free in-home demonstration."]],
] as const;
const FONTS = ["Helvetica, Arial, sans-serif", "Georgia, 'Times New Roman', serif", "Verdana, Geneva, sans-serif", "'Courier New', Courier, monospace", "'Trebuchet MS', Helvetica, sans-serif"];
const ACCENTS = ["#0b3d91", "#1b5e20", "#6a1b9a", "#004d40", "#8d1c1c", "#111111"];

const pad2 = (n: number) => String(n).padStart(2, "0");
export function usDate(ms: number): string { const d = new Date(ms); return `${pad2(d.getUTCMonth() + 1)}/${pad2(d.getUTCDate())}/${d.getUTCFullYear()}`; }
export function money(cents: number): string {
  const sign = cents < 0 ? "-" : "";
  const abs = Math.abs(cents);
  const dollars = Math.floor(abs / 100).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return `${sign}$${dollars}.${pad2(abs % 100)}`;
}
const last4 = (acct: string) => acct.replace(/\D/g, "").slice(-4);

let eligible: Hospital[] | null = null;
/** CMS hospitals whose name the production matcher resolves to their own record inside their state. */
export function eligibleHospitals(): Hospital[] {
  if (!eligible) eligible = (hospitals as Hospital[]).filter((h) => h.name.length >= 10 && h.name.length <= 44 && !/\d/.test(h.name) && ZIP3[h.state] && matchHospital(h.name, [h.state])?.ccn === h.ccn);
  return eligible;
}

export function pickTemplate(seed: number): TemplateId {
  const r = mulberry32(seed * 7919 + 13).next() * Object.values(WEIGHTS).reduce((a, b) => a + b, 0);
  let acc = 0;
  for (const t of TEMPLATES) { acc += WEIGHTS[t]; if (r < acc) return t; }
  return TEMPLATES[TEMPLATES.length - 1];
}

type Cited = { value: string; quote: string };
type Draft = { lines: string[]; blocks: string[]; truth: Extraction; hospital: Hospital | null };

function phone(rng: Rng): string {
  const a = rng.pick(AREA), n = pad2(rng.int(0, 99));
  return rng.pick([`${a}-555-01${n}`, `(${a}) 555-01${n}`, `1-800-555-01${n}`, `1-866-555-01${n}`]);
}
function account(rng: Rng): string {
  const d = (n: number) => Array.from({ length: n }, () => rng.int(0, 9)).join("");
  return rng.pick([`${d(4)}-${d(5)}`, d(10), `${d(3)}-${d(3)}-${d(4)}`, `${d(2)}-${d(7)}`]);
}
function person(rng: Rng) { return `${rng.pick(FIRST)} ${rng.pick(LAST)}`; }
function address(rng: Rng, city: string, state: string) {
  const zip = `${ZIP3[state] ?? "100"}${pad2(rng.int(0, 99))}`;
  const street = `${rng.int(2, 980)} ${rng.pick(STREETS)}${rng.chance(0.35) ? `, Apt ${rng.int(1, 12)}${rng.pick(["A", "B", "", ""])}` : ""}`;
  return { street, cityLine: `${city}, ${state} ${zip}` };
}
function amountCents(rng: Rng, lo = 1800, hi = 960_000): number {
  const c = Math.round(Math.exp(Math.log(lo) + rng.next() * (Math.log(hi) - Math.log(lo))));
  return rng.chance(0.3) ? Math.round(c / 100) * 100 : c;
}
const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const cited = (value: string, quote: string): Cited => ({ value, quote });

/** Markup for one printed line. Flex rows keep a newline between spans so the text reads as one line with a space. */
const h1 = (s: string) => `<div class="h1">${esc(s)}</div>`;
const l = (s: string, cls = "l") => `<div class="${cls}">${esc(s)}</div>`;
const p = (s: string) => `<p class="p">${esc(s)}</p>`;
const row = (a: string, b: string, cls = "row") => `<div class="${cls}"><span>${esc(a)}</span>\n<span>${esc(b)}</span></div>`;
const tr = (cells: string[], th = false) => `<tr>${cells.map((c) => `<${th ? "th" : "td"}>${esc(c)}</${th ? "th" : "td"}>`).join("\n")}</tr>`;

function hospitalHeader(rng: Rng, h: Hospital, dept: string, phones: Cited[], lines: string[], blocks: string[]) {
  const addr = address(rng, h.city, h.state);
  const ph = phone(rng);
  const q = rng.pick([`Questions: ${ph}, Monday to Friday, 8 AM to 5 PM`, `Billing questions: ${ph}`, `Customer service: ${ph}, weekdays 8:30 AM to 6 PM`]);
  phones.push(cited(ph, q));
  lines.push(h.name, dept, `${addr.street}, ${addr.cityLine}`, q);
  blocks.push(`<div class="head">${h1(h.name)}${l(dept)}${l(`${addr.street}, ${addr.cityLine}`)}${l(q)}</div>`);
}
function patientBlock(rng: Rng, h: { city: string; state: string } | null, label: string, lines: string[], blocks: string[], extra: string[] = []) {
  const name = person(rng);
  const city = h?.city ?? rng.pick(["Springfield", "Riverside", "Fairview", "Franklin", "Greenville", "Madison"]);
  const state = h?.state ?? rng.pick(Object.keys(ZIP3).filter((s) => s.length === 2 && !["PR", "VI", "GU"].includes(s)));
  const addr = address(rng, city, state);
  const out = [...extra, `${label}${name}`, addr.street, addr.cityLine];
  lines.push(...out);
  blocks.push(`<div class="meta">${out.map((s) => l(s)).join("")}</div>`);
  return name;
}
function fapParagraph(rng: Rng, ph: string): string {
  return rng.pick([
    `Financial assistance may be available: if you have trouble paying this bill, call ${ph} or visit the Patient Financial Services office to apply. No collection action will be taken while an application is under review.`,
    `You may qualify for financial assistance under our Financial Assistance Policy. Call ${ph} to ask for an application, or pick one up at any registration desk.`,
    `If you cannot pay this bill, financial assistance is available. Patients with household income below 300 percent of the federal poverty level may qualify for free or discounted care. Call ${ph} to apply.`,
  ]);
}

function billStatement(rng: Rng): Draft {
  const h = rng.pick(eligibleHospitals());
  const lines: string[] = [], blocks: string[] = [], phones: Cited[] = [];
  hospitalHeader(rng, h, rng.pick(DEPTS), phones, lines, blocks);
  const stmt = TODAY - rng.int(2, 60) * DAY, due = stmt + rng.int(21, 45) * DAY;
  const acct = account(rng);
  const stmtLine = `Statement Date: ${usDate(stmt)}`, acctLine = `Account Number: ${acct}`;
  patientBlock(rng, h, rng.pick(["Guarantor: ", "Patient: ", "Responsible party: "]), lines, blocks, [stmtLine, acctLine]);
  const n = rng.int(1, 4);
  const items = Array.from({ length: n }, () => { const charge = amountCents(rng, 8000, 420_000); const ins = Math.round(charge * (0.4 + rng.next() * 0.5)); return { date: usDate(stmt - rng.int(10, 40) * DAY), desc: rng.pick(SERVICES), charge, ins, share: charge - ins }; });
  const newCharges = items.reduce((a, i) => a + i.charge, 0), insurance = items.reduce((a, i) => a + i.ins, 0);
  const prev = rng.chance(0.7) ? 0 : amountCents(rng, 2500, 60_000);
  const dueCents = prev + newCharges - insurance;
  const amountLine = `Amount Due: ${money(dueCents)}`, dueLine = `Due Date: ${usDate(due)}`;
  const rows: [string, string][] = [["Previous balance", money(prev)], ["New charges", money(newCharges)], ["Insurance payments and adjustments", money(-insurance)]];
  for (const [a, b] of rows) lines.push(`${a} ${b}`);
  lines.push(`${amountLine} ${dueLine}`);
  blocks.push(`<div class="box">${rows.map(([a, b]) => row(a, b)).join("")}${row(amountLine, dueLine, "row total")}</div>`);
  const header = ["Date of service", "Description", "Charges", "Insurance", "Your share"];
  lines.push(header.join(" "));
  const trs = [tr(header, true)];
  for (const i of items) { const cells = [i.date, i.desc, money(i.charge), money(-i.ins), money(i.share)]; lines.push(cells.join(" ")); trs.push(tr(cells)); }
  blocks.push(`<table>${trs.join("")}</table>`);
  const first = rng.pick([`This is your first statement for this visit. Payment is due within ${rng.pick([30, 30, 45])} days of the statement date.`, `Thank you for choosing ${h.name}. Please pay the amount due by the due date, or call us to set up a payment plan.`, `Your insurance has been billed. The amount due is your share after insurance payments and adjustments.`]);
  lines.push(first); blocks.push(p(first));
  let fa: Extraction["financial_assistance"] = null;
  if (rng.chance(0.65)) {
    const ph = rng.chance(0.5) ? phones[0].value : phone(rng);
    const fap = fapParagraph(rng, ph);
    if (ph !== phones[0].value) phones.push(cited(ph, fap));
    lines.push(fap); blocks.push(p(fap));
    fa = { value: true, quote: fap.split(". ")[0] + (fap.includes(". ") ? "." : "") };
  }
  const foot = rng.pick([`Pay online, by phone, or mail a check with the stub below. Please write your account number on the check.`, `Detach and return the lower portion with your payment.`, `We accept Visa, MasterCard, Discover and personal checks.`]);
  lines.push(foot); blocks.push(l(foot, "foot"));
  const truth: Extraction = { kind: "bill", sender: cited(h.name, h.name), hospital_name: cited(h.name, h.name), amount_due: cited(money(dueCents), amountLine), statement_date: cited(usDate(stmt), stmtLine), due_date: cited(usDate(due), dueLine), financial_assistance: fa, phone_numbers: phones, account_last4: cited(last4(acct), acctLine) };
  return { lines, blocks, truth, hospital: h };
}

function billFinal(rng: Rng): Draft {
  const h = rng.pick(eligibleHospitals());
  const lines: string[] = [], blocks: string[] = [], phones: Cited[] = [];
  hospitalHeader(rng, h, rng.pick(DEPTS), phones, lines, blocks);
  const notice = TODAY - rng.int(1, 30) * DAY, due = notice + rng.int(10, 30) * DAY;
  const acct = account(rng);
  const dateLine = `Notice Date: ${usDate(notice)}`, acctLine = `Account Number: ${acct}`;
  const name = patientBlock(rng, h, "", lines, blocks, [dateLine, acctLine]);
  const title = rng.pick(["FINAL NOTICE", "PAST DUE NOTICE", "SECOND NOTICE"]);
  lines.push(title); blocks.push(l(title, "title"));
  const dueCents = amountCents(rng, 4000, 600_000);
  const amountLine = `Amount Past Due: ${money(dueCents)}`;
  const intro = `Dear ${name}, our records show that your account is past due. ${rng.pick(["We have not received a payment since your last statement.", "Previous statements were mailed to the address above.", "Your insurance has paid its share; the balance is your responsibility."])}`;
  const payBy = `Please pay by ${usDate(due)} to avoid referral to a collection agency.`;
  lines.push(intro, amountLine, payBy); blocks.push(p(intro), l(amountLine, "big"), p(payBy));
  let fa: Extraction["financial_assistance"] = null;
  if (rng.chance(0.6)) {
    const ph = phone(rng), fap = fapParagraph(rng, ph);
    phones.push(cited(ph, fap)); lines.push(fap); blocks.push(p(fap));
    fa = { value: true, quote: fap.split(". ")[0] + (fap.includes(". ") ? "." : "") };
  }
  const q = `Questions or payment arrangements: call ${phones[0].value}.`;
  lines.push(q, `Thank you for choosing ${h.name}.`); blocks.push(p(q), l(`Thank you for choosing ${h.name}.`, "foot"));
  const truth: Extraction = { kind: "bill", sender: cited(h.name, h.name), hospital_name: cited(h.name, h.name), amount_due: cited(money(dueCents), amountLine), statement_date: cited(usDate(notice), dateLine), due_date: cited(usDate(due), payBy), financial_assistance: fa, phone_numbers: phones, account_last4: cited(last4(acct), acctLine) };
  return { lines, blocks, truth, hospital: h };
}

function noticeFap(rng: Rng): Draft {
  const h = rng.pick(eligibleHospitals());
  const lines: string[] = [], blocks: string[] = [], phones: Cited[] = [];
  hospitalHeader(rng, h, rng.pick(["Financial Counseling", "Patient Financial Services", "Financial Assistance Program"]), phones, lines, blocks);
  const date = TODAY - rng.int(1, 30) * DAY, due = date + rng.int(20, 40) * DAY;
  const acct = account(rng);
  const dateLine = `Date: ${usDate(date)}`, acctLine = `Account Number: ${acct}`;
  const name = patientBlock(rng, h, "", lines, blocks, [dateLine]);
  const re = "Re: Your application for financial assistance";
  lines.push(re, acctLine, `Dear ${name},`); blocks.push(l(re, "title"), l(acctLine), p(`Dear ${name},`));
  const outcome = rng.pick(["full", "partial", "denied"] as const);
  const balance = amountCents(rng, 12_000, 900_000);
  let decision: string, fa: Extraction["financial_assistance"], amountLine: string, dueCents: number, payBy: string | null = null;
  if (outcome === "full") {
    decision = `Your application for financial assistance has been approved at 100 percent.`;
    fa = { value: true, quote: decision }; dueCents = 0; amountLine = `Amount due: ${money(0)}`;
  } else if (outcome === "partial") {
    const pct = rng.pick([50, 60, 75, 80]);
    decision = `Your application for financial assistance has been approved at ${pct} percent.`;
    fa = { value: true, quote: decision }; dueCents = Math.round(balance * (100 - pct) / 100); amountLine = `Amount due after assistance: ${money(dueCents)}`;
    payBy = `Please pay by ${usDate(due)}, or call us to arrange monthly payments.`;
  } else {
    decision = `We were not able to approve your application for financial assistance because your household income is above the program limit.`;
    fa = { value: false, quote: decision }; dueCents = balance; amountLine = `Amount due: ${money(dueCents)}`;
    payBy = `Please pay by ${usDate(due)}, or call us to arrange monthly payments.`;
  }
  const balanceLine = `Balance before assistance: ${money(balance)}`;
  lines.push(decision, balanceLine, amountLine); blocks.push(p(decision), l(balanceLine), l(amountLine, "big"));
  if (payBy) { lines.push(payBy); blocks.push(p(payBy)); }
  if (outcome === "denied") { const appeal = "You may ask for a review of this decision within 30 days by sending proof of income to the address above."; lines.push(appeal); blocks.push(p(appeal)); }
  const q = `If you have questions, call ${phones[0].value}, Monday to Friday, 8 AM to 4:30 PM.`;
  const sig = `Sincerely, ${person(rng)}, Financial Counselor`;
  lines.push(q, sig); blocks.push(p(q), l(sig));
  const truth: Extraction = { kind: "notice", sender: cited(h.name, h.name), hospital_name: cited(h.name, h.name), amount_due: cited(money(dueCents), amountLine), statement_date: cited(usDate(date), dateLine), due_date: payBy ? cited(usDate(due), payBy) : null, financial_assistance: fa, phone_numbers: phones, account_last4: cited(last4(acct), acctLine) };
  return { lines, blocks, truth, hospital: h };
}

function utility(rng: Rng): Draft {
  const [company, usedLabel, unit] = rng.pick(UTILITIES);
  const lines: string[] = [], blocks: string[] = [], phones: Cited[] = [];
  const ph = phone(rng), svc = `Customer Service: ${ph}`;
  phones.push(cited(ph, svc));
  const headLines = [company, svc];
  if (rng.chance(0.5)) { const out = phone(rng), outage = `Report an outage: ${out}`; phones.push(cited(out, outage)); headLines.push(outage); }
  lines.push(...headLines); blocks.push(`<div class="head">${h1(company)}${headLines.slice(1).map((s) => l(s)).join("")}</div>`);
  const stmt = TODAY - rng.int(2, 40) * DAY, due = stmt + rng.int(14, 30) * DAY, acct = account(rng);
  const acctLine = `Account Number: ${acct}`, stmtLine = `Statement Date: ${usDate(stmt)}`;
  const name = person(rng);
  const state = rng.pick(Object.keys(ZIP3).filter((s) => !["PR", "VI", "GU"].includes(s)));
  const addr = address(rng, rng.pick(["Springfield", "Riverside", "Fairview", "Franklin", "Greenville", "Madison", "Clinton", "Salem"]), state);
  const meta = [acctLine, stmtLine, `Customer: ${name}`, `Service Address: ${addr.street}, ${addr.cityLine}`, `Billing period: ${usDate(stmt - 32 * DAY)} to ${usDate(stmt - 2 * DAY)}`];
  lines.push(...meta); blocks.push(`<div class="meta">${meta.map((s) => l(s)).join("")}</div>`);
  const prev = amountCents(rng, 3000, 30_000), paid = rng.chance(0.8) ? prev : 0, current = amountCents(rng, 3000, 42_000);
  const total = prev - paid + current;
  const used = `${usedLabel}: ${rng.int(120, 2400).toLocaleString("en-US")} ${unit}`;
  const rows: [string, string][] = [["Previous balance", money(prev)], ["Payment received", money(-paid)], ["Current charges", money(current)]];
  const totalLine = `Total Amount Due: ${money(total)}`, dueLine = `Due Date: ${usDate(due)}`;
  lines.push(used, ...rows.map(([a, b]) => `${a} ${b}`), totalLine, dueLine);
  blocks.push(l(used), `<div class="box">${rows.map(([a, b]) => row(a, b)).join("")}${row(totalLine, "", "row total")}${row(dueLine, "", "row")}</div>`);
  const foot = [rng.pick([`Late payments are subject to a 1.5 percent charge.`, `A late fee of $5.00 applies to payments received after the due date.`]), `Pay online, by phone at ${ph}, or by mail with the stub below.`];
  lines.push(...foot); blocks.push(...foot.map((s) => p(s)));
  const truth: Extraction = { kind: "utility", sender: cited(company, company), hospital_name: null, amount_due: cited(money(total), totalLine), statement_date: cited(usDate(stmt), stmtLine), due_date: cited(usDate(due), dueLine), financial_assistance: null, phone_numbers: phones, account_last4: cited(last4(acct), acctLine) };
  return { lines, blocks, truth, hospital: null };
}

function ad(rng: Rng): Draft {
  const [company, headline, body] = rng.pick(ADS);
  const lines: string[] = [], blocks: string[] = [], phones: Cited[] = [];
  const ph = phone(rng), call = rng.pick([`Call ${ph} today.`, `Call ${ph} to book your free visit.`, `Call toll-free ${ph}.`]);
  phones.push(cited(ph, call));
  lines.push(company, headline, ...body, call);
  blocks.push(`<div class="head">${h1(company)}</div>`, l(headline, "title"), ...body.map((s) => p(s)), l(call, "big"));
  if (rng.chance(0.6)) { const exp = `Offer expires ${usDate(TODAY + rng.int(10, 60) * DAY)}.`; lines.push(exp); blocks.push(l(exp)); }
  const disclaimer = `This is an advertisement. ${company} is not affiliated with Medicare or any government agency.`;
  const state = rng.pick(Object.keys(ZIP3).filter((s) => !["PR", "VI", "GU"].includes(s)));
  const addr = address(rng, rng.pick(["Springfield", "Riverside", "Fairview", "Franklin"]), state);
  const foot = `${company}, ${addr.street}, ${addr.cityLine}`;
  lines.push(disclaimer, foot); blocks.push(l(disclaimer, "foot"), l(foot, "foot"));
  const truth: Extraction = { kind: "ad", sender: cited(company, company), hospital_name: null, amount_due: null, statement_date: null, due_date: null, financial_assistance: null, phone_numbers: phones, account_last4: null };
  return { lines, blocks, truth, hospital: null };
}

function otherLetter(rng: Rng, which: "other_appointment" | "other_results"): Draft {
  const h = rng.pick(eligibleHospitals());
  const lines: string[] = [], blocks: string[] = [], phones: Cited[] = [];
  const dept = which === "other_appointment" ? rng.pick(["Outpatient Scheduling", "Cardiology Clinic", "Orthopedic Clinic", "Imaging Department"]) : rng.pick(["Laboratory Services", "Primary Care", "Health Information Management"]);
  hospitalHeader(rng, h, dept, phones, lines, blocks);
  const date = TODAY - rng.int(1, 20) * DAY;
  const dateLine = `Date: ${usDate(date)}`;
  const name = patientBlock(rng, h, "", lines, blocks, [dateLine]);
  lines.push(`Dear ${name},`); blocks.push(p(`Dear ${name},`));
  if (which === "other_appointment") {
    const when = `${usDate(TODAY + rng.int(3, 40) * DAY)} at ${rng.int(8, 15)}:${rng.pick(["00", "15", "30", "45"])} ${rng.pick(["AM", "PM"])} with Dr. ${rng.pick(LAST)}, ${dept}`;
    const body = [`This is a reminder of your upcoming appointment:`, when, `Please arrive 15 minutes early and bring your insurance card and a list of your medications.`, `To reschedule, call ${phones[0].value}.`];
    lines.push(...body); blocks.push(p(body[0]), l(when, "big"), p(body[2]), p(body[3]));
  } else {
    const body = [`Your laboratory results from ${usDate(date - rng.int(2, 12) * DAY)} are now available in the patient portal.`, rng.pick([`Your doctor has reviewed them and no further action is needed.`, `Please call the office at ${phones[0].value} to discuss them with your doctor.`]), `A paper copy can be mailed on request.`];
    lines.push(...body); blocks.push(...body.map((s) => p(s)));
  }
  const sig = `Sincerely, ${dept}, ${h.name}`;
  lines.push(sig); blocks.push(l(sig));
  const truth: Extraction = { kind: "other", sender: cited(h.name, h.name), hospital_name: cited(h.name, h.name), amount_due: null, statement_date: cited(usDate(date), dateLine), due_date: null, financial_assistance: null, phone_numbers: phones, account_last4: null };
  return { lines, blocks, truth, hospital: h };
}

const CSS = `
.letter{box-sizing:border-box;width:100%;height:100%;padding:72px 72px 60px;color:#111;line-height:1.35}
.letter .head{padding-bottom:10px;border-bottom:2px solid var(--accent);margin-bottom:16px}
.letter .head.band{background:var(--accent);color:#fff;padding:14px 16px;border-bottom:0}
.letter .h1{font-size:1.75em;font-weight:bold;margin:0 0 4px}
.letter .l{margin:1px 0}
.letter .meta{margin:14px 0;text-align:right}
.letter .box{border:1px solid #111;padding:8px 14px;margin:16px 0}
.letter .row{display:flex;justify-content:space-between;padding:4px 0;border-bottom:1px solid #bbb}
.letter .row.total{font-weight:bold;font-size:1.2em;border-bottom:0}
.letter table{width:100%;border-collapse:collapse;margin:14px 0;font-size:.95em}
.letter th,.letter td{text-align:left;padding:4px 3px;border-bottom:1px solid #bbb;vertical-align:top}
.letter th{font-size:.85em;letter-spacing:.04em;color:#333}
.letter .p{margin:10px 0}
.letter .title{font-weight:bold;font-size:1.3em;margin:14px 0 6px;letter-spacing:.03em}
.letter .big{font-weight:bold;font-size:1.25em;margin:8px 0}
.letter .foot{margin-top:22px;font-size:.8em;color:#444}`;

/** The visible words of letter markup in reading order (styles stripped, tags as spaces, entities decoded). */
export function textOf(html: string): string {
  return html.replace(/<style[\s\S]*?<\/style>/g, " ").replace(/<[^>]+>/g, " ").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/\s+/g, " ").trim();
}

export function makeLetter(seed: number, template: TemplateId = pickTemplate(seed)): Synth {
  const rng = mulberry32(seed * 104_729 + 7);
  const style: Style = { font: rng.pick(FONTS), size: 11.5 + rng.next() * 2, band: rng.chance(0.25) ? "band" : null, accent: rng.pick(ACCENTS) };
  const draft = template === "bill_statement" ? billStatement(rng) : template === "bill_final" ? billFinal(rng) : template === "notice_fap" ? noticeFap(rng) : template === "utility" ? utility(rng) : template === "ad" ? ad(rng) : otherLetter(rng, template);
  const blocks = draft.blocks.map((b, i) => (i === 0 && style.band ? b.replace('class="head"', 'class="head band"') : b));
  const html = `<style>${CSS}</style>\n<div class="letter" style="font-family:${style.font};font-size:${style.size.toFixed(1)}pt;--accent:${style.accent}">\n${blocks.join("\n")}\n</div>`;
  return { id: `l${String(seed).padStart(5, "0")}`, seed, template, kind: KIND[template], lines: draft.lines, transcription: draft.lines.join("\n"), truth: draft.truth, hospital: draft.hospital, html, style };
}
