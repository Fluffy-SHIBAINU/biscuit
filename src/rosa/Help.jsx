import React, { useEffect } from "react";
import Dog from "../components/Dog.jsx";
import { postEvent } from "../lib/api.js";
import { navigate } from "../lib/navigate.js";
import { speakAndKeep, stopSpeaking } from "../lib/speech.js";
import { store, useStore } from "../lib/store.js";

export default function Help() {
  const s = useStore();
  const name = s.household?.called || "Rosa";
  const told = s.helpTold;
  useEffect(() => {
    speakAndKeep(["Tap Call 911 Now. Stay where you are."]);
    const onVisible = () => { if (document.visibilityState === "visible" && store.get().helpOpenAt) navigate("/help/after"); };
    document.addEventListener("visibilitychange", onVisible);
    return () => { document.removeEventListener("visibilitychange", onVisible); stopSpeaking(); };
  }, []);
  // Ana's page took the event, or did not: say so, once, and never before it is true.
  useEffect(() => { if (told === "told") speakAndKeep(["Ana knows."]); if (told === "failed") speakAndKeep(["I couldn't reach Ana's page."]); }, [told]);
  async function stop() {
    stopSpeaking();
    store.set({ helpOpenAt: null });
    postEvent("help_cancel").catch(() => {});
    navigate("/");
  }
  return (
    <main className="screen night">
      <div className="row between"><span className="label night">Biscuit · Help</span><span className="label plain">{new Date().toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}</span></div>
      <div className="row"><Dog /><h1 className="display">Help</h1></div>
      <a className="btn danger big" href="tel:911">Call 911 Now</a>
      <p className="lead">{name}, stay where you are. Tell them where you are and what happened.</p>
      <section className="card night">
        <div className="row">{told === "told" ? <><span className="dot ok" />Ana's Phone Buzzed</> : told === "failed" ? <><span className="dot bad" />Couldn't Reach Ana's Page</> : <><span className="dot wait" />Telling Ana…</>}</div>
      </section>
      {told === "failed" && s.anaPhone && <a className="btn big light" href={`tel:${s.anaPhone.replace(/[^\d+]/g, "")}`}>Call Ana</a>}
      <div className="spacer" />
      <button type="button" className="btn secondary night" onClick={stop}>Stop Help</button>
    </main>
  );
}
