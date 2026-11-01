import React from "react";
import { navigate } from "../lib/navigate.js";
import { speak } from "../lib/speech.js";
import { earError, earMode, earStatus } from "../lib/ear.js";
import { useDiag } from "../lib/diag.js";
import { useTalk } from "../lib/talkState.js";
import { useStore } from "../lib/store.js";

/** For the founder's live tests: what the voice and the ear did on this phone, newest last. Nothing here leaves the phone. */
export default function Diagnostics() {
  const lines = useDiag();
  const t = useTalk();
  const s = useStore();
  const facts = [
    ["Ear", `${earStatus()}${earError() ? ` (${earError()})` : ""} · ${earMode(s) === "recognition" ? "the phone's speech" : "microphone capture"}`],
    ["Bar", `${t.phase}${t.speechBlocked ? " · speech blocked" : ""}${t.note ? ` · ${t.note}` : ""}`],
    ["Voice", s.neuralVoice ? "Biscuit's own" : "the phone's"],
    ["Consent", s.consentedAt ? "yes" : "no"], ["Ear allowed", s.earAllowedAt ? "yes" : "no"], ["Paused", s.earPaused ? "yes" : "no"],
    ["Phone", typeof navigator !== "undefined" ? navigator.userAgent.replace(/^Mozilla\/5\.0 \(/, "").slice(0, 70) : ""],
    ["Standalone", typeof window !== "undefined" && (window.matchMedia?.("(display-mode: standalone)").matches || window.navigator.standalone) ? "yes" : "no"],
  ];
  return (
    <main className="screen">
      <div className="row between"><span className="label">Diagnostics</span><a href="/settings" className="link" onClick={(e) => { e.preventDefault(); navigate("/settings"); }}>Settings</a></div>
      <section className="card facts">{facts.map(([k, v]) => <div key={k} className="fact"><strong>{k}</strong><span className="label plain">{v}</span></div>)}</section>
      <button type="button" className="btn secondary" onClick={() => speak(["Testing, testing. This is Biscuit."])}>Say a Test Line</button>
      <section className="card"><span className="label">Log</span>{lines.length === 0 ? <p className="lead small muted">Nothing yet.</p> : lines.map((l, i) => <p key={i} className="foot" style={{ fontFamily: "var(--mono)" }}>{l}</p>)}</section>
    </main>
  );
}
