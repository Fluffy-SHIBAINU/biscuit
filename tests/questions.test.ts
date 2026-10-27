import { expect, test } from "vitest";
import { allowedQuestions, pickQuestions, QUESTIONS } from "../server/questions.js";

test("allowed questions by kind", () => {
  expect(allowedQuestions("bill", true, [])).toEqual(["Q1", "Q2", "Q3", "Q4"]);
  expect(allowedQuestions("bill", false, [])).toEqual(["Q1", "Q4"]);
  expect(allowedQuestions("ad", false, [])).toEqual(["Q6"]);
  expect(allowedQuestions("bill", true, ["Q1"])).not.toContain("Q1");
});

test("pickQuestions ignores an id outside the set and caps at two", async () => {
  expect(await pickQuestions("ad", false, [], async () => ["Q1"])).toEqual(["Q6"]);
  expect(await pickQuestions("bill", true, [], async () => ["Q3", "Q1", "Q2"])).toEqual(["Q3", "Q1"]);
});

test("pickQuestions falls back to the first two allowed when the chooser fails", async () => {
  expect(await pickQuestions("bill", true, [], async () => { throw new Error("down"); })).toEqual(["Q1", "Q2"]);
  expect(QUESTIONS.Q6.text).toBe("Shall I toss it?");
});
