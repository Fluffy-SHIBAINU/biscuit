// Where what Biscuit hears goes. Commands first (stop, help, pause, home, papers), then a message for Ana and the mail,
// which stay on the phone; everything else is the conversation on the server, which answers in Biscuit's voice and may
// move the screen. The conversation's last turns stay in memory here, and are forgotten after ten quiet minutes.
import { api, postEvent, transcribe } from "./api.js";
import { handleVoiceCommand } from "./commands.js";
import { earRunning } from "./ear.js";
import { navigate } from "./navigate.js";
import { listen, speak } from "./speech.js";
import { store } from "./store.js";
import { intentOf } from "./talk.js";
import { talkState } from "./talkState.js";
import { diag } from "./diag.js";

export const HISTORY_MAX = 12;
// For now Biscuit only talks back on his own word: no screen moves, no message goes out. Rosa taps for those. Screens'
// own choices (yes, no, open one) still work, and so do stop, help and pause.
export const ACT_ON_VOICE = false;
export const HISTORY_IDLE_MS = 10 * 60_000;
const AFTER = { read_letter: "/letter", papers: "/docket", mail_came: "/mail?from=home" };

export const history = { turns: [], at: 0 };

// A screen with choices (yes, no, not sure; yes, look or not now) owns the next words: Biscuit says the options, a match
// picks one, anything else gets the options said again (twice at most), and nothing reaches the companion meanwhile.
let activeChoices = null;
export const currentChoices = () => activeChoices;
export function optionsLine(options) {
  const says = options.map((o) => o.say || o.key);
  const list = says.length > 1 ? `${says.slice(0, -1).join(", ")}, or ${says[says.length - 1]}` : says[0];
  return `Say ${list}.`;
}
/** Ends the choices a screen left standing (it is leaving, or a button answered). */
export function cancelChoices() { const c = activeChoices; activeChoices = null; if (c) c.resolve(null); }
/**
 * Says the lines and the options, then waits for one of the options by voice: through the open ear when it is listening,
 * else one answer at a time (twice). Resolves the chosen key, or null when the screen gave up, a button answered, or
 * only the buttons are in use. The screen's buttons keep working throughout.
 */
export async function askChoices({ lines = [], options, alive = () => true, sayOptions = true }) {
  cancelChoices();
  let settled = false;
  const c = { options, misses: 0, resolve: null, done: null };
  c.done = new Promise((r) => { c.resolve = (k) => { if (!settled) { settled = true; r(k); } }; });
  activeChoices = c;
  const buttonsOnly = Boolean(store.get().buttonsMode);
  await speak([...lines, ...(sayOptions && !buttonsOnly ? [optionsLine(options)] : [])]);
  if (!alive() || buttonsOnly) { if (activeChoices === c) activeChoices = null; c.resolve(null); return c.done; }
  if (!earRunning()) {
    // no open ear here (setup, or asleep): one answer at a time, twice
    for (let i = 0; i < 2 && alive() && !settled; i++) {
      let text = "";
      try { const { blob, spoke } = await listen(); text = spoke ? await transcribe(blob) : ""; } catch { break; }
      if (!alive() || settled) break;
      if (handleVoiceCommand(text)) break;
      const hit = options.find((o) => o.match(text));
      if (hit) { c.resolve(hit.key); break; }
      if (i === 0) await speak([text.trim() ? `I didn't catch that. ${optionsLine(options)}` : optionsLine(options)]);
    }
    c.resolve(null);
  }
  const key = await c.done;
  if (activeChoices === c) activeChoices = null;
  return key;
}
const nowLocal = () => new Date().toLocaleString([], { weekday: "long", hour: "numeric", minute: "2-digit" });

/** Routes one transcript. Returns what happened, for the tests and the bar. */
export async function routeHeard(text, deps) {
  const t = (text || "").trim();
  if (!t) return "empty";
  if (deps.command(t)) return "command";
  const choices = deps.choices?.();
  if (choices) {
    const hit = choices.options.find((o) => o.match(t));
    if (hit) { choices.resolve(hit.key); return `choice:${hit.key}`; }
    choices.misses += 1;
    if (choices.misses <= 2) await deps.say([`I didn't catch that. ${optionsLine(choices.options)}`]);
    return "choice-miss";
  }
  const { intent, text: message } = intentOf(t);
  const act = deps.actOnVoice ?? ACT_ON_VOICE;
  if (intent === "tell" && !act) { await deps.say(["Tap Tell Ana to send that."]); return "tell-off"; }
  if (intent === "tell") {
    if (!message) { await deps.say(["What shall I tell her? Start with: tell Ana."]); return "tell"; }
    await deps.postEvent("rosa_said", { text: message.slice(0, 300) });
    await deps.say([`I told Ana: ${message}.`]);
    return "tell";
  }
  if (intent === "mail" && act) { deps.navigate("/mail?from=home"); return "mail"; }
  const h = deps.history;
  if (h.at && Date.now() - h.at > HISTORY_IDLE_MS) h.turns = [];
  const turns = [...h.turns, { role: "user", content: t }].slice(-HISTORY_MAX);
  let r;
  try { r = await deps.ask({ messages: turns, nowLocal: deps.nowLocal() }); }
  catch { await deps.say(["I lost my train of thought. Say that again?"]); return "error"; }
  if (!r || r.ignore || !String(r.reply || "").trim()) return "ignored";
  h.turns = [...turns, { role: "assistant", content: r.reply }].slice(-HISTORY_MAX); h.at = Date.now();
  const after = act ? AFTER[r.action] || null : null;
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
  choices: currentChoices,
  history,
  nowLocal,
};

let busy = false;
let queued = null;
export const TRANSCRIBE_TIMEOUT_MS = 15_000;
const SMALL = new Set(["a", "an", "the", "to", "me", "i", "you", "it", "is", "and", "or", "of", "in", "on", "my", "your", "do", "yes", "no", "please", "ok", "okay"]);
const norm = (t) => (t || "").toLowerCase().replace(/[^a-z0-9' ]+/g, " ").split(/\s+/).filter((w) => w && !SMALL.has(w));
/** True when the words are mostly Biscuit's own last line coming back through the microphone. */
export function echoOf(text, lastReply) {
  const a = norm(text), b = new Set(norm(lastReply));
  if (a.length < 2 || !b.size) return false;
  const hits = a.filter((w) => b.has(w)).length;
  // most of what was heard is in his line, and it is most of his line too (an answer that borrows three of his words is not an echo)
  return hits / a.length >= 0.7 && hits / b.size >= 0.5;
}
const withTimeout = (p, ms) => Promise.race([p, new Promise((_, reject) => setTimeout(() => reject(new Error("timeout")), ms))]);
/** The ear's default handler: a clip becomes words on the server, and the words are routed. One at a time. */
export async function onUtterance({ blob, spoke }) {
  if (!spoke || !blob) return;
  // words that arrive while the last ones are still being handled wait their turn (the newest only)
  if (busy) { queued = { blob, spoke }; return; }
  busy = true;
  try {
    talkState.set({ phase: "thinking", note: "" });
    let text = "";
    try { text = await withTimeout(transcribe(blob), TRANSCRIBE_TIMEOUT_MS); } catch (err) { talkState.set({ phase: "idle", note: err?.message === "timeout" ? "The words took too long to come back." : "I couldn't reach my ears on the server." }); return; }
    if (!text.trim()) { talkState.set({ phase: "idle", note: "I heard a sound but no words." }); return; }
    if (echoOf(text, talkState.get().reply)) { diag("echo", text.slice(0, 60)); talkState.set({ phase: "idle" }); return; }
    talkState.set({ heard: text, phase: "thinking" });
    diag("heard", text.slice(0, 60));
    const outcome = await routeHeard(text, liveDeps);
    diag("outcome", outcome);
    talkState.set({ phase: "idle", note: outcome === "ignored" ? "Not for me, I think." : outcome === "error" ? "I lost the thread on the server." : "" });
  } finally {
    busy = false;
    if (queued) { const next = queued; queued = null; onUtterance(next); }
  }
}
