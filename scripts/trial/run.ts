// The simulated user trial: personas generated from the brief meet Biscuit as it is, step by step, then a week of real
// synthetic letters read the way production would read them, then they hear each other, then a report. Fireworks
// DeepSeek plays the people; a Baseten model writes the report so the judge is another family.
//   npx tsx scripts/trial/run.ts --personas 36 --letters 5 --run trial1 [--truth synth/r2/holdout/truth] [--jobs 6]
import { config } from "dotenv";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { PEOPLE, PRODUCT } from "./brief.js";
import { chatFor, type Chat } from "./llm.js";
import { aggregate, letterCards, normalizePersona, parseJson, type Card, type Diary, type Persona, type Walk } from "./trial.js";

config({ path: ".env.local", override: true });
const arg = (n: string, d: string) => { const i = process.argv.indexOf(`--${n}`); return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : d; };

async function pool<T, R>(items: T[], jobs: number, fn: (t: T, i: number) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let next = 0;
  await Promise.all(Array.from({ length: jobs }, async () => { while (next < items.length) { const i = next++; out[i] = await fn(items[i], i); } }));
  return out;
}

const STEPS = ["install on the Home Screen", "type the six-digit code", "consent", "voice check", "Help test", "the mailbox phone on the sill"];

async function makePersonas(chat: Chat, n: number): Promise<Persona[]> {
  const mix = [["senior", Math.round(n * 0.6)], ["child", Math.round(n * 0.28)], ["aide", 2], ["counselor", 1], ["social_worker", 1]] as const;
  const out: Persona[] = [];
  for (const [role, count] of mix) {
    for (let start = 0; start < count; start += 6) {
      const k = Math.min(6, count - start);
      const text = await chat([{ role: "system", content: "You invent believable, specific people for a product trial. Answer with JSON only." }, { role: "user", content: `${PEOPLE}\n\nInvent ${k} different people with the role "${role}" (senior = an older person living alone who would use the phone; child = their adult child in another city; aide = a home care aide; counselor = a hospital billing counselor; social_worker). Vary age, state, health, temperament, technology comfort and the mail they get. Return {"people": [{"name", "age", "role", "situation", "tech", "hearing", "vision", "worries": [..], "voice": "how they talk, in a phrase"}]}.` }], { json: true, maxTokens: 2000, temperature: 1.0 });
      const got = parseJson(text)?.people;
      if (Array.isArray(got)) out.push(...got.slice(0, k).map((p) => normalizePersona({ ...p, role })));
    }
  }
  return out;
}

async function walkthrough(chat: Chat, p: Persona): Promise<Walk> {
  const text = await chat([{ role: "system", content: `You are ${p.name}, ${p.age}, ${p.role === "child" ? "an adult child of an older parent" : p.role}. ${p.situation} Technology: ${p.tech}. Hearing: ${p.hearing}. Vision: ${p.vision}. Worries: ${p.worries.join("; ")}. You speak ${p.voice}. Stay in character; be concrete and honest, not polite. Answer with JSON only.` }, { role: "user", content: `${PRODUCT}\n\nYou are going through the setup for the first time${p.role === "child" ? " as the family member on the laptop, then watching your parent on the phone" : ""}. For each step, say what happens in your own words. Rate confusion 0 (none) to 3 (stuck) and trust 0 (none) to 3 (full). Return {"steps": [{"step": one of ${JSON.stringify(STEPS)}, "confusion", "trust", "quote": "what you say out loud or to yourself"}], "stops": true if you give up before the end, "stopWhy": "why, or empty"}.` }], { json: true, maxTokens: 1800 });
  const j = parseJson(text) ?? {};
  const steps = Array.isArray(j.steps) ? j.steps.map((s: any) => ({ step: String(s.step ?? ""), confusion: Number(s.confusion) || 0, trust: Number(s.trust) || 0, quote: String(s.quote ?? "") })) : [];
  return { persona: p.name, role: p.role, steps, stops: Boolean(j.stops), stopWhy: String(j.stopWhy ?? "") };
}

async function week(chat: Chat, p: Persona, cards: Card[]): Promise<Diary[]> {
  const out: Diary[] = [];
  for (const c of cards) {
    const heard = p.role === "senior"
      ? `The phone chimed, you held the letter up, and Biscuit said:\n${[...c.spokenLines, ...c.offerLines].map((l) => `"${l}"`).join("\n")}\nThen it asked: ${c.questions.map((q) => `"${q}"`).join(" and ") || "nothing"}, with big Yes and No buttons.\n\nThe letter itself reads:\n${c.transcription}`
      : `Your parent's phone read this letter; on your family page you see: sender, the kind of letter, the amount and dates it spoke, each fact over the exact line it was quoted from, a pill saying "Read twice" (both AI readers agreed), and for a hospital bill a button "Review in Waive" to start a financial assistance application. What Biscuit said aloud to your parent:\n${c.spokenLines.map((l) => `"${l}"`).join("\n")}\n\nThe letter itself reads:\n${c.transcription}`;
    const text = await chat([{ role: "system", content: `You are ${p.name}, ${p.age}, ${p.role === "child" ? "an adult child of an older parent" : p.role}. ${p.situation} Technology: ${p.tech}. Hearing: ${p.hearing}. Vision: ${p.vision}. Worries: ${p.worries.join("; ")}. You speak ${p.voice}. Stay in character. Answer with JSON only.` }, { role: "user", content: `${heard}\n\nReact. Did Biscuit say the right things, miss something, say too much, say it badly? Would you act on it (pay, call, send to Ana, toss, ignore)? Return {"trust": 0-3, "confusion": 0-3, "wouldAct": true/false, "quote": "what you say, one or two sentences", "asks": ["each thing you wish it had done differently, short, up to 3"]}.` }], { json: true, maxTokens: 700 });
    const j = parseJson(text) ?? {};
    out.push({ persona: p.name, role: p.role, letter: c.id, kind: c.kind, trust: Number(j.trust) || 0, confusion: Number(j.confusion) || 0, wouldAct: Boolean(j.wouldAct), quote: String(j.quote ?? ""), asks: Array.isArray(j.asks) ? j.asks.map(String).slice(0, 3) : [] });
  }
  return out;
}

async function social(chat: Chat, p: Persona, mine: Diary[], others: Diary[]): Promise<{ persona: string; keep: boolean; why: string; post: string }> {
  const text = await chat([{ role: "system", content: `You are ${p.name}, ${p.age}, ${p.role}. ${p.situation} You speak ${p.voice}. Answer with JSON only.` }, { role: "user", content: `After a week with Biscuit, your own reactions were:\n${mine.map((d) => `- ${d.kind}: trust ${d.trust}/3, "${d.quote}"`).join("\n")}\n\nThree other people said:\n${others.map((d) => `- ${d.persona} (${d.role}) on a ${d.kind}: "${d.quote}"`).join("\n")}\n\nDo you keep using it? Return {"keep": true/false, "why": "one sentence", "post": "what you would tell a friend, one or two sentences"}.` }], { json: true, maxTokens: 400 });
  const j = parseJson(text) ?? {};
  return { persona: p.name, keep: Boolean(j.keep), why: String(j.why ?? ""), post: String(j.post ?? "") };
}

/** The report from saved evidence: Baseten's model when it answers, else Fireworks, and the header says which. */
async function writeReport(out: string, personas: Persona[], walks: Walk[], diaries: Diary[], posts: { persona: string; keep: boolean; why: string; post: string }[], letters: number) {
  const stats = aggregate(walks, diaries);
  const keep = posts.filter((p) => p.keep).length;
  writeFileSync(join(out, "stats.json"), JSON.stringify({ ...stats, keep: { n: keep, of: posts.length } }, null, 1));
  const evidence = { stats, keep: `${keep} of ${posts.length} keep using it`, walkQuotes: walks.flatMap((w) => w.steps.filter((s) => s.confusion >= 2 || s.trust <= 1).map((s) => `${w.persona} (${w.role}) at "${s.step}": ${s.quote}`)).slice(0, 60), stopWhy: walks.filter((w) => w.stops).map((w) => `${w.persona}: ${w.stopWhy}`), diaryQuotes: diaries.map((d) => `${d.persona} (${d.role}) on a ${d.kind}, trust ${d.trust}: ${d.quote} | asks: ${d.asks.join("; ")}`).slice(0, 120), posts: posts.map((p) => `${p.persona}: keep=${p.keep}; ${p.why} | ${p.post}`) };
  const messages = [{ role: "system", content: "You write a plain, specific product research report from simulated-user evidence. Quote the people. No marketing, no hedging, no bullet soup: short paragraphs and numbered lists where the content is a list. Say what the evidence supports and what it cannot." }, { role: "user", content: `Product under trial:
${PRODUCT}

Evidence from ${personas.length} simulated people (seniors, adult children, aides, a counselor, a social worker) over a setup walkthrough, a week of ${letters} letters each, and a round of hearing each other:
${JSON.stringify(evidence, null, 1)}

Write the report with these sections: 1. What confuses or stops a senior in the first ten minutes and the first week. 2. Which spoken lines they trust and which they do not, and why. 3. What the adult children ask for on the family page that is not there. 4. Which letter kinds Biscuit handles badly in their eyes. 5. The three changes that would most increase use after the first week, ranked, and the two that would most increase trust, each with the quotes behind it. 6. What makes a family stop. 7. What this trial cannot tell (it is simulated).` }];
  let judgeName = `Baseten ${process.env.TRIAL_BASETEN_MODEL || "zai-org/GLM-5.3"}`;
  let report: string;
  try { report = await chatFor("baseten")(messages, { maxTokens: 3500, temperature: 0.4 }); }
  catch (err) { console.log(JSON.stringify({ trial: { judge: "baseten failed, fireworks wrote the report", error: String((err as any)?.message ?? err).slice(0, 160) } })); judgeName = "Fireworks DeepSeek V4.1 Flash (Baseten refused the key)"; report = await chatFor("fireworks")(messages, { maxTokens: 3500, temperature: 0.4 }); }
  writeFileSync(join(out, "report.md"), `<!-- judge: ${judgeName}; people: Fireworks DeepSeek V4.1 Flash; ${personas.length} personas, ${letters} letters each -->

${report.trim()}
`);
  return judgeName;
}

async function main() {
  const n = Number(arg("personas", "36")), letters = Number(arg("letters", "5")), run = arg("run", "trial1"), jobs = Number(arg("jobs", "6"));
  const out = join("synth/trial", run);
  mkdirSync(out, { recursive: true });
  if (process.argv.includes("--report-only")) {
    const read = (f: string) => readFileSync(join(out, f), "utf8");
    const lines = (f: string) => read(f).split("\n").filter(Boolean).map((l) => JSON.parse(l));
    const judge = await writeReport(out, JSON.parse(read("personas.json")), lines("walks.jsonl"), lines("diaries.jsonl"), lines("posts.jsonl"), letters);
    console.log(`report rewritten by ${judge}`);
    return;
  }
  const people = chatFor("fireworks");
  const started = Date.now();
  const personas = await makePersonas(people, n);
  writeFileSync(join(out, "personas.json"), JSON.stringify(personas, null, 1));
  console.log(`${personas.length} personas`);
  const cards = letterCards(arg("truth", "synth/r2/holdout/truth"), letters * 3, 7);
  writeFileSync(join(out, "cards.json"), JSON.stringify(cards, null, 1));
  const walks = await pool(personas, jobs, (p) => walkthrough(people, p));
  writeFileSync(join(out, "walks.jsonl"), walks.map((w) => JSON.stringify(w)).join("\n") + "\n");
  console.log(`walkthroughs done, ${walks.filter((w) => w.stops).length} stopped`);
  const readers = personas.filter((p) => p.role === "senior" || p.role === "child");
  const diaries = (await pool(readers, jobs, (p, i) => week(people, p, cards.slice((i * letters) % cards.length, (i * letters) % cards.length + letters).concat(cards.slice(0, Math.max(0, (i * letters) % cards.length + letters - cards.length)))))).flat();
  writeFileSync(join(out, "diaries.jsonl"), diaries.map((d) => JSON.stringify(d)).join("\n") + "\n");
  console.log(`${diaries.length} letter reactions`);
  const posts = await pool(readers, jobs, (p, i) => social(people, p, diaries.filter((d) => d.persona === p.name), diaries.filter((d) => d.persona !== p.name).filter((_, k) => k % readers.length === i % 3).slice(0, 3)));
  writeFileSync(join(out, "posts.jsonl"), posts.map((d) => JSON.stringify(d)).join("\n") + "\n");
  const judge = await writeReport(out, personas, walks, diaries, posts, letters);
  console.log(`report written by ${judge} to ${out}/report.md in ${Math.round((Date.now() - started) / 1000)} s`);
}

main().catch((e) => { console.error(e); process.exit(1); });
