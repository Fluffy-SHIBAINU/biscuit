import React, { useEffect } from "react";
import Dog from "../components/Dog.jsx";
import { postEvent } from "../lib/api.js";
import { navigate } from "../lib/navigate.js";
import { speak, stopSpeaking } from "../lib/speech.js";
import { store, useStore } from "../lib/store.js";

export default function AfterHelp() {
  const s = useStore();
  const told = s.helpTold === "told";
  useEffect(() => { speak([told ? "Ana knows. Tap Call Ana, or I'm OK." : "Tap Call Ana, or I'm OK."]); return () => stopSpeaking(); }, []);
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
      <div className="row"><Dog /><h1 className="display">{told ? "Ana Knows" : "Are You OK?"}</h1></div>
      <p className="lead">{told ? `Her phone buzzed${at ? ` at ${at}` : ""}.` : "I couldn't reach Ana's page. Call her yourself if you can."}</p>
      {s.anaPhone && <a className="btn big light" href={`tel:${s.anaPhone.replace(/[^\d+]/g, "")}`}>Call Ana</a>}
      <button type="button" className="btn secondary night tall" onClick={ok}>I'm OK</button>
      <section className="card night">
        <div className="row">Need 911 again? Hold Help.</div>
        <div className="row">Biscuit stays quiet unless you ask. He never calls anyone by himself.</div>
      </section>
      <div className="spacer" />
    </main>
  );
}
