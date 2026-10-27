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
export function handleVoiceCommand(text) {
  if (saidStop(text)) { stopSpeaking(); navigate("/"); return true; }
  if (saidHelp(text)) { triggerHelpByVoice(); return true; }
  return false;
}
