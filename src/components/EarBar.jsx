import React, { useEffect, useRef, useState } from "react";
import { allowEar, earError, earLevel, earMuted, earStatus, earWanted, resumeEar, pauseEar, subscribeEar } from "../lib/ear.js";
import { primeSpeech, speak } from "../lib/speech.js";
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
  // The bar tells the page how tall it is, so every screen reserves exactly that much and a primary button can sit above it.
  const barRef = useRef(null);
  useEffect(() => {
    const el = barRef.current; if (!el) return;
    const set = () => document.documentElement.style.setProperty("--earbar-h", `${el.getBoundingClientRect().height}px`);
    set();
    const ro = typeof ResizeObserver !== "undefined" ? new ResizeObserver(set) : null;
    ro?.observe(el);
    return () => { ro?.disconnect(); document.documentElement.style.removeProperty("--earbar-h"); };
  }, []);
  const st = useStore();
  const wanted = earWanted(st);
  const status = earStatus();
  const level = earLevel();
  const title = !wanted && !st.earPaused ? "Biscuit Isn't Listening Yet"
    : status === "paused" || st.earPaused ? "Biscuit Is Paused"
    : status === "blocked" ? (earError() === "unsupported" ? "This Phone Can't Hear" : "Biscuit Can't Hear Yet")
    : status === "asleep" ? "Biscuit Is Asleep"
    : status === "looking" ? "Biscuit Is Looking at the Letter"
    : st.muted && t.phase === "speaking" ? "Biscuit Is Muted"
    : status === "held" ? "Biscuit Is Talking"
    : status !== "on" ? "Biscuit Is Waking Up"
    : t.phase === "speaking" || earMuted() ? "Biscuit Is Talking"
    : t.phase === "thinking" ? "One Moment"
    : "Biscuit Is Listening";
  // What shows large under the title: his words while he speaks (or when he could not), else hers, else a short note.
  const shown = t.speechBlocked && t.reply ? ["Biscuit Wants to Say", t.reply]
    : t.phase === "speaking" || (t.reply && !t.heard) ? ["Biscuit Says", t.reply]
    : t.note ? ["", t.note]
    : t.heard ? ["You Said", t.heard]
    : null;
  return (
    <div ref={barRef} className={`earbar ${status === "on" ? "on" : ""}`}>
      <div className="earhead">
        <span className={`eardot ${status === "on" ? (level ? "loud" : "on") : status === "paused" ? "paused" : ""}`} aria-hidden="true" />
        <span className="eartitle" role="status" aria-live="polite">{title}</span>
        {status === "asleep" && <button type="button" className="btn earbtn" onClick={() => primeSpeech()}>Tap to Wake Him</button>}
        {t.speechBlocked && t.reply && status === "on" && <button type="button" className="btn earbtn" onClick={() => { primeSpeech(); speak([t.reply]); }}>Tap to Hear Him</button>}
        {(status === "paused" || st.earPaused) && <button type="button" className="btn earbtn" onClick={() => resumeEar()}>Listen</button>}
        {!st.earPaused && (!wanted || status === "blocked" || (status === "off" && earError())) && earError() !== "unsupported" && <button type="button" className="btn earbtn" onClick={() => { primeSpeech(); allowEar(); }}>Let Me Hear</button>}
        {status === "on" && !st.earPaused && !(t.speechBlocked && t.reply) && <button type="button" className="btn earbtn secondary" onClick={() => pauseEar()}>Pause</button>}
      </div>
      {shown && (
        <div className="earbody">
          {shown[0] && <span className="label">{shown[0]}</span>}
          <p className="earline">{shown[1]}</p>
        </div>
      )}
    </div>
  );
}
