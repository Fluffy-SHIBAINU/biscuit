import { postEvent } from "./api.js";
import { navigate } from "./navigate.js";
import { speak, stopSpeaking } from "./speech.js";
import { store } from "./store.js";

import { pauseEar } from "./ear.js";

export const saidStop = (text) => /\bstop\b/i.test(text || "");

/**
 * Biscuit hears the room all day, so "help" must mean Help, and a real call for it must never be missed: "help" as the
 * first word, whatever follows ("Help, I've fallen"), "Help! Help!", "somebody help", "I need (some) help", an
 * emergency ("call 911", "call an ambulance", "I've fallen", "I can't get up", "I can't breathe"). Not "help me with the
 * crossword", "help me remember my pills" or "help" in passing.
 */
export function saidHelp(text) {
  const t = (text || "").trim().toLowerCase().replace(/[.!?,;:]+/g, " ").replace(/\s+/g, " ").trim();
  if (!t) return false;
  if (/\b(emergency|call 911|call nine one one|nine one one|call (an |the )?ambulance|i('ve| have) fallen|i fell( down)?|can'?t get up|can'?t breathe|i need (some |any )?help|need help now|help help|somebody help|someone help)\b/.test(t)) return true;
  const lead = /^(biscuit |hey biscuit |please |oh )*help\b(.*)$/.exec(t);
  if (!lead) return false;
  // a leading "help me with/remember/find..." is a request, not an alarm
  return !/^ me (with|to|remember|find|read|understand|figure|look|get|pick|choose|write|fill|open)\b/.test(lead[2]);
}

/** "Biscuit, pause", "stop listening", "go to sleep": the ear closes until she taps Listen. A plain "stop" is not this. */
export const saidPause = (text) => /\b(stop listening|pause listening|go to sleep|be quiet now)\b|^\s*(biscuit[, ]+)?pause\s*$/i.test((text || "").replace(/[.!?]+/g, " ").trim());

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
