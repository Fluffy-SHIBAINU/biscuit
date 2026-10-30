import { postEvent } from "./api.js";
import { navigate } from "./navigate.js";
import { speak, stopSpeaking } from "./speech.js";
import { store } from "./store.js";

export const saidStop = (text) => /\bstop\b/i.test(text || "");
export const saidHelp = (text) => /\bhelp\b/i.test(text || "");

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
  if (saidStop(text)) { stopSpeaking(); navigate("/"); return true; }
  if (saidHelp(text)) { triggerHelpByVoice(); return true; }
  if (saidHome(text)) { stopSpeaking(); navigate("/"); return true; }
  if (saidPapers(text)) { stopSpeaking(); navigate("/docket"); return true; }
  return false;
}
