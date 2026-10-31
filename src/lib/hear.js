// Where what Biscuit hears goes. Commands first (stop, help, pause, home, papers), then a message for Ana and the mail,
// which stay on the phone; everything else is the conversation on the server, which answers in Biscuit's voice and may
// move the screen. The conversation's last turns stay in memory here, and are forgotten after ten quiet minutes.
import { api, postEvent, transcribe } from "./api.js";
import { handleVoiceCommand } from "./commands.js";
import { navigate } from "./navigate.js";
import { speak } from "./speech.js";
import { intentOf } from "./talk.js";
import { talkState } from "./talkState.js";

export const HISTORY_MAX = 12;
export const HISTORY_IDLE_MS = 10 * 60_000;
const AFTER = { read_letter: "/letter", papers: "/docket", mail_came: "/mail?from=home" };

export const history = { turns: [], at: 0 };
const nowLocal = () => new Date().toLocaleString([], { weekday: "long", hour: "numeric", minute: "2-digit" });

/** Routes one transcript. Returns what happened, for the tests and the bar. */
export async function routeHeard(text, deps) {
  const t = (text || "").trim();
  if (!t) return "empty";
  if (deps.command(t)) return "command";
  const { intent, text: message } = intentOf(t);
  if (intent === "tell") {
    if (!message) { await deps.say(["What shall I tell her? Start with: tell Ana."]); return "tell"; }
    await deps.postEvent("rosa_said", { text: message.slice(0, 300) });
    await deps.say([`I told Ana: ${message}.`]);
    return "tell";
  }
  if (intent === "mail") { deps.navigate("/mail?from=home"); return "mail"; }
  const h = deps.history;
  if (h.at && Date.now() - h.at > HISTORY_IDLE_MS) h.turns = [];
  const turns = [...h.turns, { role: "user", content: t }].slice(-HISTORY_MAX);
  let r;
  try { r = await deps.ask({ messages: turns, nowLocal: deps.nowLocal() }); }
  catch { await deps.say(["I lost my train of thought. Say that again?"]); return "error"; }
  if (!r || r.ignore || !String(r.reply || "").trim()) return "ignored";
  h.turns = [...turns, { role: "assistant", content: r.reply }].slice(-HISTORY_MAX); h.at = Date.now();
  const after = AFTER[r.action] || null;
  await deps.say([r.reply]);
  if (after) { deps.navigate(after); return `action:${after}`; }
  return "reply";
}

const liveDeps = {
  say: async (lines) => { talkState.set({ reply: lines.join(" "), phase: "speaking" }); await speak(lines); talkState.set({ phase: "idle" }); },
  navigate,
  postEvent: (kind, data) => postEvent(kind, data).catch(() => {}),
  ask: (body) => api("/companion", { method: "POST", json: body }),
  command: handleVoiceCommand,
  history,
  nowLocal,
};

let busy = false;
export const TRANSCRIBE_TIMEOUT_MS = 15_000;
const withTimeout = (p, ms) => Promise.race([p, new Promise((_, reject) => setTimeout(() => reject(new Error("timeout")), ms))]);
/** The ear's default handler: a clip becomes words on the server, and the words are routed. One at a time. */
export async function onUtterance({ blob, spoke }) {
  if (!spoke || !blob || busy) return;
  busy = true;
  try {
    talkState.set({ phase: "thinking", note: "" });
    let text = "";
    try { text = await withTimeout(transcribe(blob), TRANSCRIBE_TIMEOUT_MS); } catch (err) { talkState.set({ phase: "idle", note: err?.message === "timeout" ? "The words took too long to come back." : "I couldn't reach my ears on the server." }); return; }
    if (!text.trim()) { talkState.set({ phase: "idle", note: "I heard a sound but no words." }); return; }
    talkState.set({ heard: text, phase: "thinking" });
    const outcome = await routeHeard(text, liveDeps);
    talkState.set({ phase: "idle", note: outcome === "ignored" ? "Not for me, I think." : outcome === "error" ? "I lost the thread on the server." : "" });
  } finally { busy = false; }
}
