import { expect, test } from "vitest";
import { MENU_LINES, intentOf, saidMine, saidWrong } from "../src/lib/talk.js";

// Talk to Biscuit turns words into one of five moves; anything unclear gets the menu, never a guess.
test("intentOf hears a letter, the papers, the mail, a message for Ana, or nothing clear", () => {
  expect(intentOf("I have a letter here")).toEqual({ intent: "letter" });
  expect(intentOf("read this bill for me")).toEqual({ intent: "letter" });
  expect(intentOf("can you read my mail")).toEqual({ intent: "letter" });
  expect(intentOf("what do I have")).toEqual({ intent: "papers" });
  expect(intentOf("show me my papers")).toEqual({ intent: "papers" });
  expect(intentOf("the mail came")).toEqual({ intent: "mail" });
  expect(intentOf("mail just arrived")).toEqual({ intent: "mail" });
  expect(intentOf("tell Ana I'm fine today")).toEqual({ intent: "tell", text: "I'm fine today" });
  expect(intentOf("Tell Anna the doctor called.")).toEqual({ intent: "tell", text: "the doctor called" });
  expect(intentOf("tell Ana")).toEqual({ intent: "tell", text: "" });
  expect(intentOf("what can you do")).toEqual({ intent: "menu" });
  expect(intentOf("the weather is nice")).toEqual({ intent: "menu" });
  expect(intentOf("")).toEqual({ intent: "nothing" });
  expect(MENU_LINES.join(" ")).toMatch(/letter/);
  expect(MENU_LINES.join(" ")).toMatch(/Ana/);
});

// On "addressed to someone else", Rosa can overrule: "it's mine" plays the reading. After a reading, "yes" or "wrong" means a note for Ana.
test("saidMine and saidWrong hear the override and the complaint", () => {
  expect(saidMine("it's mine")).toBe(true);
  expect(saidMine("That is mine, read it")).toBe(true);
  expect(saidMine("yes")).toBe(true);
  expect(saidMine("no, that's right")).toBe(false);
  expect(saidMine("")).toBe(false);
  expect(saidWrong("yes, the amount is wrong")).toBe(true);
  expect(saidWrong("that's not right")).toBe(true);
  expect(saidWrong("no")).toBe(false);
  expect(saidWrong("nothing")).toBe(false);
  expect(saidWrong("")).toBe(false);
});
