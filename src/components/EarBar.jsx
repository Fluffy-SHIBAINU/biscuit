import React, { useEffect, useRef, useState } from "react";
import { allowEar, earError, earStatus, earWanted, resumeEar, pauseEar } from "../lib/ear.js";
import { useMood } from "../lib/mood.js";
import { primeSpeech, speak } from "../lib/speech.js";
import { useStore } from "../lib/store.js";
import { useTalk } from "../lib/talkState.js";

/**
 * The bar at the foot of every one of Rosa's screens: whether Biscuit is listening, the last thing he heard and said, and
 * one button, Pause or Listen. When the phone wants a tap before it opens the microphone, the button is Let Me Hear.
 */
export default function EarBar() {
  const t = useTalk();
  const { mood, title } = useMood();
  // Resumed from paused: the dot swells once. His name heard: the dot lights for a moment.
  const lastMood = useRef(mood);
  const [woke, setWoke] = useState(false);
  useEffect(() => { if (lastMood.current === "paused" && mood !== "paused") { setWoke(true); const k = setTimeout(() => setWoke(false), 300); return () => clearTimeout(k); } lastMood.current = mood; }, [mood]);
  const [named, setNamed] = useState(false);
  const lastAt = useRef(0);
  useEffect(() => { if (!t.heard || t.at === lastAt.current) return; lastAt.current = t.at; if (/\bbiscuit\b/i.test(t.heard)) { setNamed(true); const k = setTimeout(() => setNamed(false), 700); return () => clearTimeout(k); } }, [t.at, t.heard]);
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
  // What shows large under the title: his words while he speaks (or when he could not), else hers, else a short note.
  const shown = t.speechBlocked && t.reply ? ["Biscuit Wants to Say", t.reply]
    : t.phase === "speaking" || (t.reply && !t.heard) ? ["Biscuit Says", t.reply]
    : t.note ? ["", t.note]
    : t.heard ? ["You Said", t.heard]
    : null;
  return (
    <div ref={barRef} className={`earbar ${status === "on" ? "on" : ""}`} data-mood={mood} data-named={named || undefined} style={{ viewTransitionName: "earbar" }}>
      <div className="earhead">
        <span className={`eardot ${woke ? "woke" : ""}`} aria-hidden="true" />
        <span className="eartitle" role="status" aria-live="polite"><span key={title} className="eartitle-text">{title}</span></span>
        {status === "asleep" && <button type="button" className="btn earbtn" onClick={() => primeSpeech()}>Tap to Wake Him</button>}
        {t.speechBlocked && t.reply && status === "on" && <button type="button" className="btn earbtn" onClick={() => { primeSpeech(); speak([t.reply]); }}>Tap to Hear Him</button>}
        {(status === "paused" || st.earPaused) && <button type="button" className="btn earbtn" onClick={() => resumeEar()}>Listen</button>}
        {!st.earPaused && (!wanted || status === "blocked" || (status === "off" && earError())) && earError() !== "unsupported" && <button type="button" className="btn earbtn" onClick={() => { primeSpeech(); allowEar(); }}>Let Me Hear</button>}
        {status === "on" && !st.earPaused && !(t.speechBlocked && t.reply) && <button type="button" className="btn earbtn secondary" onClick={() => pauseEar()}>Pause</button>}
      </div>
      {shown && (
        <div className="earbody">
          {shown[0] && <span className="label">{shown[0]}</span>}
          <p key={shown[1]} className="earline">{shown[1]}</p>
        </div>
      )}
    </div>
  );
}
