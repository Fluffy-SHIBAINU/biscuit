import React, { useEffect, useState } from "react";
import { allowEar, earError, earLevel, earMuted, earStatus, earWanted, resumeEar, pauseEar, subscribeEar } from "../lib/ear.js";
import { speak } from "../lib/speech.js";
import { useStore } from "../lib/store.js";
import { useTalk } from "../lib/talkState.js";

/**
 * The bar at the foot of every one of Rosa's screens: whether Biscuit is listening, the last thing he heard and said, and
 * one button, Pause or Listen. When the phone wants a tap before it opens the microphone, the button is Let Me Hear.
 */
export default function EarBar() {
  const t = useTalk();
  const [, tick] = useState(0);
  useEffect(() => subscribeEar(() => tick((n) => n + 1)), []);
  const st = useStore();
  const wanted = earWanted(st);
  const status = earStatus();
  const level = earLevel();
  const title = !wanted && !st.earPaused ? "Biscuit isn't listening yet"
    : status === "paused" || st.earPaused ? "Biscuit is paused"
    : status === "blocked" ? (earError() === "unsupported" ? "This phone can't hear" : "Biscuit can't hear yet")
    : status !== "on" ? "Biscuit is waking up"
    : t.phase === "speaking" || earMuted() ? "Biscuit is talking"
    : t.phase === "thinking" ? "One moment"
    : "Biscuit is listening";
  const line = t.speechBlocked && t.reply ? `Biscuit wants to say: ${t.reply}` : t.note ? t.note : t.phase === "speaking" || (t.reply && !t.heard) ? t.reply : t.heard ? `You said: ${t.heard}` : "";
  return (
    <div className={`earbar ${status === "on" ? "on" : ""}`} role="status" aria-live="polite">
      <span className={`eardot ${status === "on" ? (level ? "loud" : "on") : status === "paused" ? "paused" : ""}`} aria-hidden="true" />
      <div className="eartext">
        <span className="label">{title}</span>
        {line && <span className="earline">{line}</span>}
      </div>
      {t.speechBlocked && t.reply && status === "on" && <button type="button" className="btn earbtn" onClick={() => speak([t.reply])}>Tap to hear him</button>}
      {(status === "paused" || st.earPaused) && <button type="button" className="btn earbtn" onClick={() => resumeEar()}>Listen</button>}
      {!st.earPaused && (!wanted || status === "blocked" || status === "off") && earError() !== "unsupported" && <button type="button" className="btn earbtn" onClick={() => allowEar()}>Let me hear</button>}
      {status === "on" && !st.earPaused && !(t.speechBlocked && t.reply) && <button type="button" className="btn earbtn secondary" onClick={() => pauseEar()}>Pause</button>}
    </div>
  );
}
