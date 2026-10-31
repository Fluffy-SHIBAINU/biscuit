import { postEvent } from "./api.js";
import { navigate } from "./navigate.js";
import { speak, stopSpeaking } from "./speech.js";
import { store } from "./store.js";

import { pauseEar } from "./ear.js";

export const saidStop = (text) => /\bstop\b/i.test(text || "");

/**
 * Biscuit hears the room all day, so "help" must mean Help: the word by itself ("Biscuit, help", "help me", "Help!"), a
 * plain call for it ("I need help"), or an emergency ("call 911", "emergency"). Never "help me with the crossword".
 */
export function saidHelp(text) {
  const t = (text || "").trim().toLowerCase().replace(/[.!?,]+/g, " ").replace(/\s+/g, " ").trim();
  if (!t) return false;
  if (/^(biscuit |hey biscuit |please )?help( me)?( please)?$/.test(t)) return true;
  return /\b(i need help|need help now|emergency|call 911|call nine one one|nine one one)\b/.test(t);
}

/** "Biscuit, pause", "stop listening", "go to sleep": the ear closes until she taps Listen. A plain "stop" is not this. */
export const saidPause = (text) => /\b(stop listening|pause listening|go to sleep|be quiet now)\b|^\s*(biscuit[, ]+)?pause\s*$/i.test(text || "");

/** Starts Help from a spoken "Biscuit, help": tells Ana's page and opens the Help screen, where one tap calls 911. */
export function triggerHelpByVoice() {
  stopSpeaking();
  store.set({ helpOpenAt: new Date().toISOString() });
  postEvent("help", { by: "voice" }).catch(() => {});
  navigate("/help");
  speak(["Ana has been told. Tap Call 911 now."]);
}

/** Shared voice commands for every listening screen. True when the words were a command and were handled. */
export const saidHome = (text) => /\b(go home|home screen|main screen|start over)\b/i.test(text || "");
export const saidPapers = (text) => /\b(my papers|what do i have|what have i got)\b/i.test(text || "");

export function handleVoiceCommand(text) {
  if (saidPause(text)) { stopSpeaking(); pauseEar(); speak(["All right, I'll stop listening. Tap Listen when you want me."]); return true; }
  if (saidStop(text)) { stopSpeaking(); navigate("/"); return true; }
  if (saidHelp(text)) { triggerHelpByVoice(); return true; }
  if (saidHome(text)) { stopSpeaking(); navigate("/"); return true; }
  if (saidPapers(text)) { stopSpeaking(); navigate("/docket"); return true; }
  return false;
}
