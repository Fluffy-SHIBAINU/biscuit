import React, { useEffect, useRef, useState } from "react";
import { useMood } from "../lib/mood.js";
import { useTalk } from "../lib/talkState.js";

let landed = false;

/**
 * Biscuit. His ears, eyes, mouth and collar tag show the mood (the same word the bar at the foot shows), he turns his head
 * when he hears his name, and he tilts it once when he says hello. All of it is CSS on data attributes; see app.css.
 */
export default function Dog({ size = 76, mood: forced = null }) {
  const { mood } = useMood();
  const t = useTalk();
  const [named, setNamed] = useState(false);
  const [greet, setGreet] = useState(false);
  const lastAt = useRef(0);
  useEffect(() => {
    if (!t.heard || t.at === lastAt.current) return;
    lastAt.current = t.at;
    if (/\bbiscuit\b/i.test(t.heard) && document.visibilityState === "visible") { setNamed(true); const k = setTimeout(() => setNamed(false), 700); return () => clearTimeout(k); }
  }, [t.at, t.heard]);
  useEffect(() => {
    if (!t.helloAt || landed) return;
    landed = true; setGreet(true);
    const k = setTimeout(() => setGreet(false), 700);
    return () => clearTimeout(k);
  }, [t.helloAt]);
  return (
    <svg role="img" aria-label="Biscuit" className={`dog ${greet ? "greet" : ""}`} data-mood={forced || mood} data-named={named || undefined} width={size} height={size} viewBox="0 0 72 72" fill="none" style={{ viewTransitionName: "biscuit" }}>
      <g className="head">
        <path className="ear ear-l" d="M17 24c-7 3-11 15-7 26 1.4 3.8 5.6 4.6 7.8 1.4L25 40 17 24z" fill="#7C4A03" />
        <path className="ear ear-r" d="M55 24c7 3 11 15 7 26-1.4 3.8-5.6 4.6-7.8 1.4L47 40l8-16z" fill="#7C4A03" />
        <circle cx="36" cy="36" r="23" fill="#E7C98A" stroke="#7C4A03" strokeWidth="2" />
        <ellipse cx="36" cy="44" rx="12" ry="9" fill="#F6E7C6" />
        <g className="eyes"><circle className="eye" cx="27.5" cy="32" r="2.8" fill="#0B1220" /><circle className="eye" cx="44.5" cy="32" r="2.8" fill="#0B1220" /></g>
        <path d="M31 41.5h10c0 3.2-2.2 5.5-5 5.5s-5-2.3-5-5.5z" fill="#0B1220" />
        <path className="smile" d="M36 47v3.2M36 50.2c-1.8 2.2-4.4 2.4-6 .6M36 50.2c1.8 2.2 4.4 2.4 6 .6" stroke="#0B1220" strokeWidth="1.8" strokeLinecap="round" />
        <ellipse className="mouth-open" cx="36" cy="51" rx="3.4" ry="2.4" fill="#0B1220" />
      </g>
      <path d="M19 55.5c6.5 4.5 27.5 4.5 34 0" stroke="#0E7490" strokeWidth="4.5" strokeLinecap="round" />
      <circle className="tag" cx="36" cy="61" r="3" fill="#06B6D4" stroke="#0B1220" strokeWidth="1" />
    </svg>
  );
}
