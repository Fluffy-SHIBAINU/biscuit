import React, { useEffect } from "react";
import Dog from "../components/Dog.jsx";
import { postEvent } from "../lib/api.js";
import { navigate } from "../lib/navigate.js";
import { speak, stopSpeaking } from "../lib/speech.js";
import { store, useStore } from "../lib/store.js";

export default function AfterHelp() {
  const s = useStore();
  useEffect(() => { speak(["Ana knows. Her phone buzzed. Tap Call Ana, or I'm OK."]); return () => stopSpeaking(); }, []);
  async function ok() {
    stopSpeaking();
    store.set({ helpOpenAt: null });
    postEvent("help_ok").catch(() => {});
    await speak(["Good. I'll stay quiet unless you ask."]);
    navigate("/");
  }
  const at = s.helpOpenAt ? new Date(s.helpOpenAt).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }) : "";
  return (
    <main className="screen night">
      <div className="row between"><span className="label night">Biscuit · Help</span><span className="label plain">{new Date().toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}</span></div>
      <div className="row"><Dog /><h1 className="display">Ana Knows</h1></div>
      <p className="lead">Her phone buzzed{at ? ` at ${at}` : ""}. Her page says: {s.household?.called || "Rosa"} called 911.</p>
      {s.anaPhone && <a className="btn big light" href={`tel:${s.anaPhone.replace(/[^\d+]/g, "")}`}>Call Ana <span className="hint">Your Phone Dials Her · One Tap</span></a>}
      <button type="button" className="btn secondary night tall" onClick={ok}>I'm OK <span className="hint">Tells Ana's Page</span></button>
      <section className="card night">
        <div className="row">Need 911 again? Hold Help.</div>
        <div className="row">Biscuit stays quiet unless you ask. He never calls anyone by himself.</div>
      </section>
      <div className="spacer" />
    </main>
  );
}
