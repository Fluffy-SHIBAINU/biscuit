import { expect, test } from "vitest";
import { routeHeard } from "../src/lib/hear.js";

function fake(reply) {
  const log = [];
  const deps = {
    say: async (lines) => { log.push(["say", lines.join(" ")]); },
    navigate: (p) => log.push(["nav", p]),
    postEvent: async (kind, data) => { log.push(["event", kind, data]); },
    ask: async (body) => { log.push(["ask", body.messages.map((m) => m.content).join("|")]); return typeof reply === "function" ? reply(body) : reply; },
    command: (t) => { if (/\bstop\b/i.test(t)) { log.push(["command", t]); return true; } return false; },
    history: { turns: [] },
    nowLocal: () => "Friday 3:00 PM",
  };
  return { deps, log };
}

// Everything Biscuit hears goes one of these ways: nothing, a command, a message for Ana, the mail, or the companion.
test("routeHeard: silence does nothing, a command is a command, tell Ana and the mail stay local", async () => {
  const { deps, log } = fake({ reply: "x", action: "none", ignore: false });
  deps.actOnVoice = true;
  expect(await routeHeard("", deps)).toBe("empty");
  expect(await routeHeard("stop", deps)).toBe("command");
  expect(await routeHeard("tell Ana I'm fine today", deps)).toBe("tell");
  expect(log).toContainEqual(["event", "rosa_said", { text: "I'm fine today" }]);
  expect(log.find((l) => l[0] === "say")[1]).toMatch(/I told Ana: I'm fine today/);
  expect(await routeHeard("the mail came", deps)).toBe("mail");
  expect(log).toContainEqual(["nav", "/mail?from=home"]);
  expect(log.filter((l) => l[0] === "ask")).toHaveLength(0);
});

test("routeHeard: anything else is a conversation; the reply is spoken, an action moves the screen only when voice actions are on, and the history keeps the last turns", async () => {
  const { deps, log } = fake((body) => body.messages.at(-1).content.includes("letter") ? { reply: "Show me!", action: "read_letter", ignore: false } : { reply: "Oatmeal sounds lovely.", action: "none", ignore: false });
  deps.actOnVoice = true;
  expect(await routeHeard("I had oatmeal", deps)).toBe("reply");
  expect(log).toContainEqual(["say", "Oatmeal sounds lovely."]);
  expect(deps.history.turns).toEqual([{ role: "user", content: "I had oatmeal" }, { role: "assistant", content: "Oatmeal sounds lovely." }]);
  expect(await routeHeard("can you read this letter", deps)).toBe("action:/letter");
  expect(log.at(-1)).toEqual(["nav", "/letter"]);
  for (let i = 0; i < 10; i++) await routeHeard(`turn ${i}`, deps);
  expect(deps.history.turns.length).toBeLessThanOrEqual(12);
});

// The room talks too: the television, a visitor. When the model says the words were not for Biscuit, he stays quiet.
// For now Biscuit only talks back: no screen moves and no message goes out on his word alone. Rosa taps for those.
test("routeHeard with voice actions off: a reply is spoken, the screen stays, tell Ana and the mail become words", async () => {
  const { deps, log } = fake({ reply: "Show me!", action: "read_letter", ignore: false });
  expect(await routeHeard("read this letter", deps)).toBe("reply");
  expect(log.filter((l) => l[0] === "nav")).toHaveLength(0);
  expect(await routeHeard("tell Ana I'm fine", deps)).toBe("tell-off");
  expect(log.filter((l) => l[0] === "event")).toHaveLength(0);
  expect(log.at(-1)[1]).toMatch(/Tell Ana/);
  expect(await routeHeard("the mail came", deps)).toBe("reply");
  expect(log.filter((l) => l[0] === "nav")).toHaveLength(0);
});

test("routeHeard: words not meant for Biscuit are ignored, and a model 'help' is never the Help flow", async () => {
  const { deps, log } = fake({ reply: "", action: "none", ignore: true });
  expect(await routeHeard("and now the weather for the tri-state area", deps)).toBe("ignored");
  expect(log.filter((l) => l[0] === "say")).toHaveLength(0);
  expect(deps.history.turns).toEqual([]);
  const second = fake({ reply: "Do you need help?", action: "help", ignore: false });
  expect(await routeHeard("my knee aches a bit", second.deps)).toBe("reply");
  expect(second.log.filter((l) => l[0] === "nav")).toHaveLength(0);
});

// The phone's recognizer hears Biscuit too, a second late: his own last line coming back is not Rosa.
test("echoOf tells Biscuit's own line from Rosa's words", async () => {
  const { echoOf } = await import("../src/lib/hear.js");
  expect(echoOf("Woof! Mail's here, Rosa.", "Woof! Mail's here, Rosa. Want me to take a look?")).toBe(true);
  expect(echoOf("mail's here Rosa want me to take a look", "Woof! Mail's here, Rosa. Want me to take a look?")).toBe(true);
  expect(echoOf("yes please take a look", "Woof! Mail's here, Rosa. Want me to take a look?")).toBe(false);
  expect(echoOf("tell Ana I'm fine", "")).toBe(false);
  expect(echoOf("yes", "yes")).toBe(false);
});

// A screen with choices (yes, no, not sure) owns the next words: a match picks the option, anything else gets the options
// said again, and nothing goes to the companion while the choices stand. Commands still win.
test("routeHeard with choices: a match picks the option, a miss repeats the options, the companion is never asked", async () => {
  const { optionsLine } = await import("../src/lib/hear.js");
  const options = [{ key: "yes", say: "yes", match: (t) => /\byes\b/i.test(t) }, { key: "no", say: "no", match: (t) => /\bno\b/i.test(t) }, { key: "unsure", say: "not sure", match: (t) => /not sure/i.test(t) }];
  expect(optionsLine(options)).toBe("Say yes, no, or not sure.");
  expect(optionsLine(options.slice(0, 1))).toBe("Say yes.");
  const picked = [];
  const choices = { options, misses: 0, resolve: (k) => picked.push(k) };
  const { deps, log } = fake({ reply: "I'd love to chat.", action: "none", ignore: false });
  deps.choices = () => choices;
  expect(await routeHeard("I had oatmeal and I think not sure really", deps)).toBe("choice:unsure");
  expect(picked).toEqual(["unsure"]);
  expect(await routeHeard("the weather is lovely", deps)).toBe("choice-miss");
  expect(log.at(-1)).toEqual(["say", "I didn't catch that. Say yes, no, or not sure."]);
  expect(await routeHeard("stop", deps)).toBe("command");
  expect(log.filter((l) => l[0] === "ask")).toHaveLength(0);
  // after two misses the options are not repeated a third time, so the room does not get lectured
  await routeHeard("blah", deps);
  const before = log.length;
  expect(await routeHeard("blah again", deps)).toBe("choice-miss");
  expect(log.length).toBe(before);
});
