import React, { useEffect } from "react";
import Dog from "../components/Dog.jsx";
import { postEvent } from "../lib/api.js";
import { navigate } from "../lib/navigate.js";
import { speakAndKeep, stopSpeaking } from "../lib/speech.js";
import { store, useStore } from "../lib/store.js";

export default function Help() {
  const s = useStore();
  const name = s.household?.called || "Rosa";
  useEffect(() => {
    speakAndKeep(["Your phone is calling 911. Stay where you are. Tell them where you are and what happened. Ana has been told."]);
    const onVisible = () => { if (document.visibilityState === "visible" && store.get().helpOpenAt) navigate("/help/after"); };
    document.addEventListener("visibilitychange", onVisible);
    return () => { document.removeEventListener("visibilitychange", onVisible); stopSpeaking(); };
  }, []);
  async function stop() {
    stopSpeaking();
    store.set({ helpOpenAt: null });
    postEvent("help_cancel").catch(() => {});
    navigate("/");
  }
  return (
    <main className="screen night">
      <div className="row between"><span className="label night">Biscuit · Help</span><span className="label plain">{new Date().toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}</span></div>
      <div className="row"><Dog /><h1 className="display">Your Phone Is Calling 911</h1></div>
      <a className="btn danger big" href="tel:911">Call 911 Now</a>
      <p className="lead">{name}, stay where you are. Tell them where you are and what happened.</p>
      <section className="card night">
        <div className="row"><span className="dot ok" />Ana's Page Told · Her Phone Buzzed</div>
        <div className="row">911 gets your location from the phone itself, not from Biscuit.</div>
        <div className="row">Cancel on the phone: Help ends, and Ana's page says you cancelled.</div>
      </section>
      <div className="spacer" />
      <button type="button" className="btn secondary night" onClick={stop}>Stop <span className="hint">Ends Help · Tells Ana's Page</span></button>
    </main>
  );
}
