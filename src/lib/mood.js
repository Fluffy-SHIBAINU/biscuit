// One mood for one creature. The dog at the top of the screen and the bar at its foot read the same word, in the same
// frame: off, paused, blocked, asleep, looking, muted, talking, waking, thinking, hearing, listening. Two short holds keep
// the word from flickering between his sentences (waking) and at syllable rate (hearing).
import { useEffect, useRef, useState } from "react";
import { earError, earLevel, earMuted, earStatus, earWanted, subscribeEar } from "./ear.js";
import { useStore } from "./store.js";
import { useTalk } from "./talkState.js";

export const MOODS = ["off", "paused", "blocked", "asleep", "looking", "muted", "talking", "waking", "thinking", "hearing", "listening"];

export function moodOf({ wanted, earPaused, status, muted, phase, level, earMuted: heMuted }) {
  if (!wanted && !earPaused) return "off";
  if (status === "paused" || earPaused) return "paused";
  if (status === "blocked") return "blocked";
  if (status === "asleep") return "asleep";
  if (status === "looking") return "looking";
  if (muted && phase === "speaking") return "muted";
  if (status === "held") return "talking";
  if (status !== "on") return "waking";
  if (phase === "speaking" || heMuted) return "talking";
  if (phase === "thinking") return "thinking";
  if (level) return "hearing";
  return "listening";
}

export function titleOf(mood, error) {
  switch (mood) {
    case "off": return "Biscuit Isn't Listening Yet";
    case "paused": return "Biscuit Is Paused";
    case "blocked": return error === "unsupported" ? "This Phone Can't Hear" : "Biscuit Can't Hear Yet";
    case "asleep": return "Biscuit Is Asleep";
    case "looking": return "Biscuit Is Looking at the Letter";
    case "muted": return "Biscuit Is Muted";
    case "talking": return "Biscuit Is Talking";
    case "waking": return "Biscuit Is Waking Up";
    case "thinking": return "One Moment";
    default: return "Biscuit Is Listening";
  }
}

const WAKE_HOLD_MS = 400;
const HEAR_HOLD_MS = 300;

/** The mood right now, with its holds, for any component that shows Biscuit. */
export function useMood() {
  const st = useStore();
  const t = useTalk();
  const [, tick] = useState(0);
  useEffect(() => subscribeEar(() => tick((n) => n + 1)), []);
  const raw = moodOf({ wanted: earWanted(st), earPaused: st.earPaused, status: earStatus(), muted: st.muted, phase: t.phase, level: earLevel(), earMuted: earMuted() });
  const [shown, setShown] = useState(raw);
  const last = useRef(raw);
  const timer = useRef(null);
  useEffect(() => {
    clearTimeout(timer.current);
    const prev = last.current;
    // between his sentences the ear closes and reopens: keep the last word for a moment instead of showing Waking Up
    if (raw === "waking" && (prev === "talking" || prev === "listening" || prev === "hearing" || prev === "thinking")) { timer.current = setTimeout(() => { last.current = raw; setShown(raw); }, WAKE_HOLD_MS); return; }
    // the sound meter flips every frame: hearing lingers a little after the sound stops
    if (raw === "listening" && prev === "hearing") { timer.current = setTimeout(() => { last.current = raw; setShown(raw); }, HEAR_HOLD_MS); return; }
    last.current = raw; setShown(raw);
  }, [raw]);
  useEffect(() => () => clearTimeout(timer.current), []);
  return { mood: shown, error: earError(), title: titleOf(shown, earError()) };
}
