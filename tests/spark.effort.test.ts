import { expect, test } from "vitest";
import { chooseQuestions, extractFacts, transcribeLetter } from "../server/meta/spark.js";
import spark from "./fixtures/meta/spark-extract.json" with { type: "json" };
import transcribed from "./fixtures/meta/spark-transcribe.json" with { type: "json" };
import questions from "./fixtures/meta/spark-questions.json" with { type: "json" };

// Muse Spark reasons by default (over a thousand reasoning tokens on a two-field extraction, eight seconds a call).
// Reading a letter is transcription and copying, so every Spark call asks for minimal reasoning: the 12-second budget needs it.
function capture(reply: unknown) {
  const bodies: Record<string, unknown>[] = [];
  return { bodies, chat: async (body: Record<string, unknown>) => { bodies.push(body); return reply; } };
}

test("transcription asks Spark for minimal reasoning", async () => {
  const { bodies, chat } = capture(transcribed);
  await transcribeLetter(Buffer.from("ffd8ffd9", "hex"), chat);
  expect(bodies[0].reasoning_effort).toBe("minimal");
});

test("extraction asks Spark for minimal reasoning", async () => {
  const { bodies, chat } = capture(spark);
  await extractFacts("Amount Due: $1,850.00", chat);
  expect(bodies[0].reasoning_effort).toBe("minimal");
});

test("question choice asks Spark for minimal reasoning", async () => {
  const { bodies, chat } = capture(questions);
  await chooseQuestions("bill", [], chat);
  expect(bodies[0].reasoning_effort).toBe("minimal");
});
