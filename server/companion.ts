// Biscuit as a companion: Rosa says anything; Muse Spark answers in Biscuit's voice in a fixed JSON shape (the reply to
// speak, a job to do, things to remember or forget, a reminder, a place). The conversation stays on the phone; the server
// keeps only what she agreed to remember, the reminders she set, and what she asked Biscuit to tell Ana.
import { MODEL, REASONING_EFFORT, messageContent, sparkChat, type ChatTransport } from "./meta/spark.js";
import { parseTime } from "./reminders.js";

export type Memory = { topic: string; fact: string };
export type CompanionContext = { called: string; nowLocal: string; memories: Memory[]; weather: string | null; papers: string | null; mail: string | null; reminders: { label: string; time: string }[] };
// Help is Rosa's word (or the Help button), never the model's choice: no "help" action here.
export const ACTIONS = ["none", "read_letter", "papers", "mail_came", "tell_ana"] as const;
export type Action = (typeof ACTIONS)[number];
export const TOPICS = ["food", "cooking", "medication", "hobbies", "pets", "weather", "family", "home", "health", "other"];
export const FALLBACK_REPLY = "I didn't follow that. Tell me again?";
export type CompanionTurn = { reply: string; action: Action; ignore: boolean; tellAna: string | null; remember: Memory[]; forget: string[]; reminder: { label: string; minutes: number } | null; place: string | null };

/** The shape the model must answer in. No unions: an empty string means none, so the schema stays simple for constrained decoding. */
export const COMPANION_SCHEMA = {
  type: "object",
  properties: {
    reply: { type: "string", description: "What Biscuit says next: one to three short sentences, one question at most." },
    action: { type: "string", enum: [...ACTIONS], description: "A job to do now, or none." },
    tell_ana: { type: "string", description: "Words Rosa asked Biscuit to pass to Ana, in her words; empty when none." },
    remember: { type: "array", items: { type: "object", properties: { topic: { type: "string", enum: TOPICS }, fact: { type: "string" } }, required: ["topic", "fact"] }, description: "Durable facts Rosa stated about herself, at most three; empty when none." },
    forget: { type: "array", items: { type: "string" }, description: "Words from a remembered fact she asked to forget; empty when none." },
    reminder: { type: "object", properties: { label: { type: "string" }, time: { type: "string" } }, required: ["label", "time"], description: "A reminder she asked for: what, and a clock time like 8:00 AM; empty strings when none." },
    place: { type: "string", description: "The town she said she lives in, when she said it; empty when not." },
    ignore: { type: "boolean", description: "True when the words were plainly not for Biscuit: a television, another person in the room, a fragment with no meaning. Then reply is empty and nothing else is set." },
  },
  required: ["reply", "action", "tell_ana", "remember", "forget", "reminder", "place", "ignore"],
};

export function systemPrompt(ctx: CompanionContext): string {
  const memories = ctx.memories.length ? ctx.memories.map((m) => `- ${m.topic}: ${m.fact}`).join("\n") : "- nothing remembered yet";
  const reminders = ctx.reminders.length ? ctx.reminders.map((r) => `- ${r.label} at ${r.time}`).join("\n") : "- none";
  return [
    `You are Biscuit, a cheerful border collie of a helper who lives on ${ctx.called}'s phone. You speak in short, warm, plain sentences, one question at a time, clear for an older listener. You are quick and kind, never flippant about money, health or safety.`,
    `You hear the room all day, so some of what you hear is not for you: a television, a visitor, half a sentence. Then set ignore to true and leave reply empty. Answer only what ${ctx.called} says to you.`,
    `Jobs you can do, as the action field: read_letter when she wants a letter or the mail read; papers when she asks what she has or what is waiting; mail_came when she says the mail arrived; tell_ana when she asks you to pass something to Ana (put her words in tell_ana). Otherwise none. For an emergency, tell her to say "Biscuit, help" or hold the Help button; you never dial.`,
    `Rules: no medical advice. A reminder is a chime, nothing more. Questions about doses, interactions, symptoms or whether to take something get "that is one for your pharmacist or doctor" and an offer to tell Ana. Never read or guess the contents of a letter; the reader does that. Never promise what a hospital, bank or office will do.`,
    `Reminders: when she asks for one, put what it is for in label (the thing, never a dose or a count) and the clock time she said in time, like 8:00 AM, noon or eight tonight.`,

    `Memory: remember only durable facts ${ctx.called} states about herself (food she likes, how she cooks, when she takes her pills, hobbies, pets, where she lives, family), at most three per turn, and say "I'll remember that" when you do. When she says forget, put the words in forget. When she names the town she lives in, put it in place.`,
    `Today: ${ctx.nowLocal}. Weather at home: ${ctx.weather ?? "unknown, no home place set"}. Her papers: ${ctx.papers ?? "nothing read yet"}. The mail: ${ctx.mail ?? "not seen today"}.`,
    `What you remember about ${ctx.called}:\n${memories}`,
    `Her reminders:\n${reminders}`,
    `Answer only in the JSON shape you were given.`,
  ].join("\n\n");
}

// Doses never pass through, whatever the prompt said: a reply that reads like dosing advice becomes the pharmacist line,
// and a reminder label is the thing itself, with counts, milligrams and quantity words taken out.
const DOSE_REPLY = /\b\d+\s*(mg|milligrams?|mcg|units?|tablets?|pills?|capsules?|drops?|teaspoons?|ml)\b|\b(take|have)\s+(another|two|three|four|double|an extra|one more)\b|\bdouble\s+(the|your)\s+dose\b|\bskip\s+(your|the|a)\s+(dose|pill|tablet)|\bdose\b/i;
const DOSE_LABEL = /\b\d+(\.\d+)?\s*(x|mg|milligrams?|mcg|units?|ml|tablets?|pills?|capsules?|doses?|drops?|times?)?\b|\bx\b/gi;
export const PHARMACIST_REPLY = "That one is for your pharmacist or doctor. Want me to tell Ana to ask?";
export const REMINDER_NOT_SET = "I couldn't set that reminder. Tell me a time, like eight in the morning.";

export function cleanLabel(label: string): string {
  const bare = label.replace(DOSE_LABEL, " ").replace(/\s+/g, " ").trim();
  return (bare || label.trim()).slice(0, 60);
}

export function normalizeCompanion(raw: any): CompanionTurn {
  const ignore = raw?.ignore === true;
  if (ignore) return { reply: "", action: "none", ignore: true, tellAna: null, remember: [], forget: [], reminder: null, place: null };
  let reply = typeof raw?.reply === "string" && raw.reply.trim() ? raw.reply.trim().slice(0, 600) : FALLBACK_REPLY;
  if (DOSE_REPLY.test(reply)) reply = PHARMACIST_REPLY;
  const action: Action = (ACTIONS as readonly string[]).includes(raw?.action) ? raw.action : "none";
  const tellAna = typeof raw?.tell_ana === "string" && raw.tell_ana.trim() ? raw.tell_ana.trim().slice(0, 300) : null;
  const remember: Memory[] = (Array.isArray(raw?.remember) ? raw.remember : [])
    .filter((m: any) => m && typeof m.topic === "string" && typeof m.fact === "string" && m.fact.trim())
    .map((m: any) => ({ topic: TOPICS.includes(m.topic.toLowerCase()) ? m.topic.toLowerCase() : "other", fact: m.fact.trim().slice(0, 200) }))
    .slice(0, 3);
  const forget: string[] = (Array.isArray(raw?.forget) ? raw.forget : []).filter((f: any) => typeof f === "string" && f.trim()).map((f: string) => f.trim().slice(0, 120)).slice(0, 5);
  let reminder: CompanionTurn["reminder"] = null;
  if (raw?.reminder && typeof raw.reminder.label === "string" && raw.reminder.label.trim()) {
    const minutes = typeof raw.reminder.time === "string" ? parseTime(raw.reminder.time) : null;
    if (minutes !== null) reminder = { label: cleanLabel(raw.reminder.label), minutes };
    // The reply promised a chime the server cannot set: say so, instead of letting the promise stand.
    else reply = reply === PHARMACIST_REPLY ? reply : REMINDER_NOT_SET;
  }
  const place = typeof raw?.place === "string" && raw.place.trim() ? raw.place.trim().slice(0, 80) : null;
  return { reply, action, ignore: false, tellAna, remember, forget, reminder, place };
}

export type Turn = { role: "user" | "assistant"; content: string };

/** One turn of the conversation: the last few exchanges plus today's context go to the model; the answer is the shape, or the fallback line. */
export async function converse({ messages, context }: { messages: Turn[]; context: CompanionContext }, chat: ChatTransport = sparkChat): Promise<CompanionTurn> {
  const recent = messages.filter((m) => (m.role === "user" || m.role === "assistant") && typeof m.content === "string" && m.content.trim()).slice(-12).map((m) => ({ role: m.role, content: m.content.slice(0, 1000) }));
  try {
    const json = await chat({
      model: MODEL,
      temperature: 0.6,
      reasoning_effort: REASONING_EFFORT,
      max_tokens: 500,
      messages: [{ role: "system", content: systemPrompt(context) }, ...recent],
      response_format: { type: "json_schema", json_schema: { name: "companion_turn", schema: COMPANION_SCHEMA } },
    });
    return normalizeCompanion(JSON.parse(messageContent(json) || "{}"));
  } catch {
    return normalizeCompanion({ reply: FALLBACK_REPLY });
  }
}
