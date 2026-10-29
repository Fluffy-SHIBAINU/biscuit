import { expect, test } from "vitest";
import { aggregate, letterCards, normalizePersona, parseJson, ROLES, type Diary, type Walk } from "../scripts/trial/trial.js";

// The simulated user trial: personas hear what Biscuit would really say for real synthetic letters; the pure parts here.
const truthDir = new URL("../synth/r2/holdout/truth", import.meta.url).pathname;

test("letter cards carry the letter and the lines Biscuit would speak for it", () => {
  const cards = letterCards(truthDir, 6, 3);
  expect(cards).toHaveLength(6);
  expect(letterCards(truthDir, 6, 3).map((c) => c.id)).toEqual(cards.map((c) => c.id));
  expect(new Set(cards.map((c) => c.kind)).size).toBeGreaterThan(1);
  for (const c of cards) {
    expect(c.transcription.split(/\s+/).length).toBeGreaterThan(30);
    expect(c.spokenLines.length).toBeGreaterThan(0);
    expect(c.spokenLines[0]).toMatch(/^This is (addressed to|from) /);
    if (c.kind === "bill") expect(c.offerLines[0]).toBe("Shall I send this to Ana?");
  }
});

test("a persona is normalised: role from the list, age clamped, missing fields filled", () => {
  const p = normalizePersona({ name: "Rosa Alvarez", age: 121, role: "Senior living alone", situation: "", tech: "calls and photos", hearing: "aid in one ear", worries: ["scams"] });
  expect(p).toMatchObject({ name: "Rosa Alvarez", age: 95, role: "senior", tech: "calls and photos" });
  expect(p.situation).toBe("");
  expect(p.worries).toEqual(["scams"]);
  expect(normalizePersona({ name: "Ana", role: "adult child", age: 52 }).role).toBe("child");
  expect(normalizePersona({ name: "X", role: "nobody", age: 40 }).role).toBe("other");
  expect(ROLES).toContain("aide");
});

test("parseJson takes the object out of prose and fences", () => {
  expect(parseJson('Here you go:\n```json\n{"a": 1}\n```')).toEqual({ a: 1 });
  expect(parseJson("no json here")).toBeNull();
  expect(parseJson('{"a": [1, 2]} trailing')).toEqual({ a: [1, 2] });
});

test("aggregate counts confusion, trust, stops and asks across personas", () => {
  const walks: Walk[] = [
    { persona: "p1", role: "senior", steps: [{ step: "install", confusion: 3, trust: 1, quote: "What is a Home Screen?" }, { step: "code", confusion: 0, trust: 2, quote: "Fine." }], stops: true, stopWhy: "could not install" },
    { persona: "p2", role: "senior", steps: [{ step: "install", confusion: 1, trust: 2, quote: "" }, { step: "code", confusion: 0, trust: 3, quote: "" }], stops: false, stopWhy: "" },
  ];
  const diaries: Diary[] = [
    { persona: "p1", role: "senior", letter: "l1", kind: "bill", trust: 1, confusion: 2, wouldAct: false, quote: "Too fast.", asks: ["slower voice", "repeat"] },
    { persona: "p2", role: "senior", letter: "l2", kind: "ad", trust: 3, confusion: 0, wouldAct: true, quote: "Toss it.", asks: ["Slower voice"] },
  ];
  const s = aggregate(walks, diaries);
  expect(s.steps.install).toEqual({ n: 2, confusion: 2, trust: 1.5 });
  expect(s.steps.code).toEqual({ n: 2, confusion: 0, trust: 2.5 });
  expect(s.stops).toEqual({ n: 1, of: 2, why: ["could not install"] });
  expect(s.kinds.bill).toEqual({ n: 1, trust: 1, confusion: 2, wouldAct: 0 });
  expect(s.asks[0]).toEqual({ ask: "slower voice", n: 2 });
});
