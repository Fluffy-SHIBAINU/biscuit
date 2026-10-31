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
  expect(await routeHeard("", deps)).toBe("empty");
  expect(await routeHeard("stop", deps)).toBe("command");
  expect(await routeHeard("tell Ana I'm fine today", deps)).toBe("tell");
  expect(log).toContainEqual(["event", "rosa_said", { text: "I'm fine today" }]);
  expect(log.find((l) => l[0] === "say")[1]).toMatch(/I told Ana: I'm fine today/);
  expect(await routeHeard("the mail came", deps)).toBe("mail");
  expect(log).toContainEqual(["nav", "/mail?from=home"]);
  expect(log.filter((l) => l[0] === "ask")).toHaveLength(0);
});

test("routeHeard: anything else is a conversation; the reply is spoken, an action moves the screen, and the history keeps the last turns", async () => {
  const { deps, log } = fake((body) => body.messages.at(-1).content.includes("letter") ? { reply: "Show me!", action: "read_letter", ignore: false } : { reply: "Oatmeal sounds lovely.", action: "none", ignore: false });
  expect(await routeHeard("I had oatmeal", deps)).toBe("reply");
  expect(log).toContainEqual(["say", "Oatmeal sounds lovely."]);
  expect(deps.history.turns).toEqual([{ role: "user", content: "I had oatmeal" }, { role: "assistant", content: "Oatmeal sounds lovely." }]);
  expect(await routeHeard("can you read this letter", deps)).toBe("action:/letter");
  expect(log.at(-1)).toEqual(["nav", "/letter"]);
  for (let i = 0; i < 10; i++) await routeHeard(`turn ${i}`, deps);
  expect(deps.history.turns.length).toBeLessThanOrEqual(12);
});

// The room talks too: the television, a visitor. When the model says the words were not for Biscuit, he stays quiet.
test("routeHeard: words not meant for Biscuit are ignored, and a model 'help' is never the Help flow", async () => {
  const { deps, log } = fake({ reply: "", action: "none", ignore: true });
  expect(await routeHeard("and now the weather for the tri-state area", deps)).toBe("ignored");
  expect(log.filter((l) => l[0] === "say")).toHaveLength(0);
  expect(deps.history.turns).toEqual([]);
  const second = fake({ reply: "Do you need help?", action: "help", ignore: false });
  expect(await routeHeard("my knee aches a bit", second.deps)).toBe("reply");
  expect(second.log.filter((l) => l[0] === "nav")).toHaveLength(0);
});
