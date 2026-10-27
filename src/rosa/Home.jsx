import React from "react";
import Dog from "../components/Dog.jsx";
import { navigate } from "../lib/navigate.js";
import { store, useStore } from "../lib/store.js";
import { pushSupported, subscribePush } from "../lib/push.js";
import { getDocket } from "../lib/api.js";
import { useEffect, useRef, useState } from "react";
import { holdToHelp } from "../lib/hold.js";
import { postEvent } from "../lib/api.js";

const DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const clock = (d) => d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });

export function greeting(now = new Date(), name = "Rosa") {
  const h = now.getHours();
  const part = h < 12 ? "morning" : h < 18 ? "afternoon" : "evening";
  return `Good ${part}, ${name}.`;
}

export default function Home() {
  const s = useStore();
  const [chimeError, setChimeError] = useState("");
  const [holding, setHolding] = useState(0);
  const helpRef = useRef(null);
  useEffect(() => {
    if (!helpRef.current) return;
    return holdToHelp(helpRef.current, () => {
      // Runs inside the pointerup handler: the release is the gesture that may open the phone's "Call 911?" sheet.
      store.set({ helpOpenAt: new Date().toISOString() });
      postEvent("help").catch(() => {});
      window.location.assign("tel:911");
      navigate("/help");
    }, 2000, setHolding, () => setArmed(true));
  }, [s.consentedAt]);
  const [armed, setArmed] = useState(false);
  useEffect(() => { if (!holding) setArmed(false); }, [holding]);
  useEffect(() => {
    if (!s.deviceToken) return;
    const refresh = () => getDocket().then((d) => { if (d.lastMailSeen) store.set({ lastMailSeen: d.lastMailSeen }); }).catch(() => {});
    const onVisible = () => { if (document.visibilityState === "visible") refresh(); };
    document.addEventListener("visibilitychange", onVisible);
    const t = setInterval(refresh, 60_000);
    return () => { document.removeEventListener("visibilitychange", onVisible); clearInterval(t); };
  }, [s.deviceToken]);
  useEffect(() => {
    if (!s.deviceToken) return;
    getDocket().then((d) => { if (d.lastMailSeen) store.set({ lastMailSeen: d.lastMailSeen }); }).catch(() => {});
  }, [s.deviceToken]);
  async function turnOnChime() {
    try { const ok = await subscribePush(); if (!ok) setChimeError("The phone said no to notifications. Allow them in Settings for Biscuit."); }
    catch { setChimeError("Couldn't turn the chime on. Try again."); }
  }
  const now = new Date();
  const name = s.household?.called || "Rosa";
  const seen = s.lastMailSeen ? new Date(s.lastMailSeen) : null;
  const sameDay = seen && seen.toDateString() === now.toDateString();
  const waiting = s.docket.find((l) => l.status === "handoff" || l.status === "waiting_hospital");
  return (
    <main className="screen">
      <div className="row between"><span className="label">Biscuit · Kindred</span><span className="label plain">{DAYS[now.getDay()]} {clock(now)}</span></div>
      <div className="row"><Dog /><h1 className="display">{greeting(now, name)}</h1></div>
      <section className="card">
        <span className="label">Today's mail</span>
        <p className="lead">{sameDay ? `The mail came at ${clock(seen)}.` : "No mail seen yet today."}</p>
        <span className="label plain">Seen by the mailbox phone · no pictures kept</span>
        <a href="/mail?from=home" className="link" onClick={(e) => { e.preventDefault(); navigate("/mail?from=home"); }}>Mail came and I didn't say so? Tap here.</a>
      </section>
      {!s.pushSubscribed && pushSupported() && <button type="button" className="btn secondary" onClick={turnOnChime}>Turn on the mail chime</button>}
      {chimeError && <p className="foot bad">{chimeError}</p>}
      <button type="button" className="btn big" onClick={() => navigate("/talk")}>Talk to Biscuit</button>
      <button type="button" className="btn secondary" onClick={() => navigate("/letter")}>Show me a letter</button>
      {s.consentedAt && <button type="button" ref={helpRef} className={`btn danger hold ${armed ? "armed" : ""}`} style={{ "--hold": holding }}>{armed ? "Let go to call 911" : "Help"} <span className="hint">{armed ? "Ana is told when you let go" : "hold 2 s · calls 911, tells Ana"}</span></button>}
      <div className="spacer" />
      {waiting && (
        <section className="card">
          <span className="label">Waiting on</span>
          <p className="lead small">{waiting.waitingLine || `${waiting.sender}'s answer.`}</p>
        </section>
      )}
      <p className="foot">Biscuit is a computer helper from Kindred. Say <strong>stop</strong> and he stops. <a href="/settings" className="link" onClick={(e) => { e.preventDefault(); navigate("/settings"); }}>Settings</a></p>
    </main>
  );
}
