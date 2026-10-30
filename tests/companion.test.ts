import { expect, test } from "vitest";
import { COMPANION_SCHEMA, converse, normalizeCompanion, systemPrompt } from "../server/companion.js";

const ctx = { called: "Rosa", nowLocal: "Thursday 3:40 PM", memories: [{ topic: "pets", fact: "has a cat named Pickles" }, { topic: "food", fact: "likes oatmeal with raisins" }], weather: "Sunny, 58 now, high 64, rain unlikely.", papers: "2 letters, 1 waiting on the hospital", mail: "the mail came at 11:09 AM", reminders: [{ label: "pills", time: "8:00 AM" }] };

test("the system prompt carries who Biscuit is, the rules and what he knows today", () => {
  const p = systemPrompt(ctx);
  expect(p).toMatch(/Biscuit/);
  expect(p).toMatch(/Rosa/);
  expect(p).toMatch(/pharmacist or doctor/i);
  expect(p).toMatch(/Pickles/);
  expect(p).toMatch(/oatmeal/);
  expect(p).toMatch(/Sunny, 58/);
  expect(p).toMatch(/2 letters/);
  expect(p).toMatch(/8:00 AM/);
  expect(p).toMatch(/never dial/i);
  expect(systemPrompt({ ...ctx, memories: [], weather: null, reminders: [] })).toMatch(/nothing remembered yet/i);
});

test("normalizeCompanion keeps the shape and drops anything outside it", () => {
  const n = normalizeCompanion({ reply: "  Sure thing, Rosa!  ", action: "read_letter", tell_ana: "x".repeat(400), remember: [{ topic: "pets", fact: "has a cat named Pickles" }, { topic: "nonsense", fact: 42 }, { topic: "food", fact: "" }], forget: ["Pickles", 3], reminder: { label: "pills", time: "08:00" }, place: "Boston, MA" });
  expect(n.reply).toBe("Sure thing, Rosa!");
  expect(n.action).toBe("read_letter");
  expect(n.tellAna!.length).toBe(300);
  expect(n.remember).toEqual([{ topic: "pets", fact: "has a cat named Pickles" }]);
  expect(n.forget).toEqual(["Pickles"]);
  expect(n.reminder).toEqual({ label: "pills", minutes: 480 });
  expect(n.place).toBe("Boston, MA");
  const bad = normalizeCompanion({ reply: "", action: "dial_911", reminder: { label: "pills", time: "25:00" }, remember: Array.from({ length: 6 }, (_, i) => ({ topic: "food", fact: `fact ${i}` })) });
  expect(bad.reply).toBe("I didn't follow that. Tell me again?");
  expect(bad.action).toBe("none");
  expect(bad.reminder).toBeNull();
  expect(bad.remember).toHaveLength(3);
  expect(COMPANION_SCHEMA.required).toContain("reply");
});

test("converse asks the model for the JSON shape and falls back to a plain line when the call fails", async () => {
  const seen: any[] = [];
  const chat = async (body: any) => { seen.push(body); return { choices: [{ message: { content: JSON.stringify({ reply: "Oatmeal with raisins again? Good choice.", action: "none", remember: [{ topic: "food", fact: "likes oatmeal with raisins" }] }) } }] }; };
  const out = await converse({ messages: [{ role: "user", content: "I had oatmeal with raisins today" }], context: ctx }, chat);
  expect(out.reply).toBe("Oatmeal with raisins again? Good choice.");
  expect(out.remember[0].topic).toBe("food");
  expect(seen[0].response_format.type).toBe("json_schema");
  expect(seen[0].messages[0].role).toBe("system");
  expect(seen[0].messages[seen[0].messages.length - 1].content).toBe("I had oatmeal with raisins today");
  const down = await converse({ messages: [{ role: "user", content: "hello" }], context: ctx }, async () => { throw new Error("down"); });
  expect(down.reply).toMatch(/didn't follow|try again/i);
  expect(down.action).toBe("none");
});
