import { expect, test } from "vitest";
import { saidHelp, saidPause } from "../src/lib/commands.js";

// With Biscuit hearing all day, "help" must mean Help: the word alone or an emergency, never "help me with the crossword".
test("saidHelp hears a call for help, not the word in passing", () => {
  expect(saidHelp("Biscuit, help")).toBe(true);
  expect(saidHelp("help me")).toBe(true);
  expect(saidHelp("Help!")).toBe(true);
  expect(saidHelp("I need help")).toBe(true);
  expect(saidHelp("call 911")).toBe(true);
  expect(saidHelp("this is an emergency")).toBe(true);
  expect(saidHelp("helpful tips")).toBe(false);
  expect(saidHelp("can you help me with the crossword")).toBe(false);
  expect(saidHelp("help me remember my pills")).toBe(false);
  expect(saidHelp("that was a big help")).toBe(false);
  expect(saidHelp("")).toBe(false);
});

test("saidPause hears Rosa asking Biscuit to stop listening", () => {
  expect(saidPause("Biscuit, pause")).toBe(true);
  expect(saidPause("stop listening")).toBe(true);
  expect(saidPause("go to sleep")).toBe(true);
  expect(saidPause("pause the movie")).toBe(false);
  expect(saidPause("stop")).toBe(false);
  expect(saidPause("")).toBe(false);
});
