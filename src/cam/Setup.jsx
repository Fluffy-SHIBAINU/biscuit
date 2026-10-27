import React, { useEffect, useRef, useState } from "react";
import { grabJpeg, openCamera, stopCamera } from "../lib/camera.js";
import { findMailbox, padRegion, setRegion } from "../lib/camapi.js";
import { navigate } from "../lib/navigate.js";
import { speak } from "../lib/speech.js";
import { store, useStore } from "../lib/store.js";

const STEP = { denied: "Camera · 1 of 4 · can't see", place: "Camera · 2 of 4 · live", looking: "Camera · 3 of 4 · looking", found: "Camera · 3 of 4 · found", wrong: "Camera · 3 of 4 · tap the box", notfound: "Camera · 3 of 4 · not found", set: "Camera · 3 of 4 · set" };

export default function Setup() {
  const s = useStore();
  const video = useRef(null);
  const stream = useRef(null);
  const [phase, setPhase] = useState("opening");
  const [box, setBox] = useState(null);
  const [score, setScore] = useState(null);
  const [refusals, setRefusals] = useState(s.camRefusals || 0);
  const [looks, setLooks] = useState(0);
  const [wrongs, setWrongs] = useState(0);
  const [tap, setTap] = useState(null);

  async function open() {
    setPhase("opening");
    try {
      stream.current = await openCamera(video.current);
      try { await navigator.wakeLock?.request("screen"); } catch { /* optional */ }
      setPhase("place");
    } catch {
      const n = refusals + 1;
      setRefusals(n); store.set({ camRefusals: n });
      setPhase("denied");
    }
  }
  useEffect(() => { open(); return () => stopCamera(stream.current); }, []);

  async function find(point) {
    setPhase("looking");
    try {
      const jpeg = await grabJpeg(video.current, 1280, 600_000);
      const r = await findMailbox(jpeg, point);
      setBox(r.box); setScore(r.score); setPhase("found");
    } catch (err) {
      if (err?.status === 404) { setPhase(point ? "wrong" : "notfound"); if (!point) setLooks(looks + 1); }
      else setPhase("notfound");
    }
  }

  async function confirm() {
    const region = padRegion(box);
    await setRegion(region);
    store.set({ cam: { region, setAt: new Date().toISOString(), testStatus: "pending" } });
    setPhase("set");
    speak(["Set. I'll watch only this box."]);
  }

  function onTap(e) {
    const rect = e.currentTarget.getBoundingClientRect();
    const p = { x: (e.clientX - rect.left) / rect.width, y: (e.clientY - rect.top) / rect.height };
    setTap(p);
  }

  const overlay = box && (phase === "found" || phase === "set") ? { left: `${box.x * 100}%`, top: `${box.y * 100}%`, width: `${box.w * 100}%`, height: `${box.h * 100}%` } : null;

  if (phase === "denied") return (
    <main className="screen">
      <span className="label">{STEP.denied}</span>
      <h1 className="display small">Biscuit can't see.</h1>
      <section className="card status"><span className="pill warn">Not yet</span><p className="lead small">The browser said no to the camera.</p></section>
      <section className="card"><span className="label">Allow it</span><ol className="steps"><li>Tap the icon by the address: <strong>aA</strong> on an iPhone, the lock on Android.</li><li>Website settings › Camera › <strong>Allow</strong>.</li><li>Come back here and tap Try again.</li></ol><span className="label plain">iPhone still saying no: Settings › Safari › Camera › Allow</span></section>
      <button type="button" className="btn" onClick={open}>Try again</button>
      {refusals >= 3 && <button type="button" className="btn secondary" onClick={() => { store.set({ cam: { skipped: true } }); navigate("/cam/rest"); }}>Set the camera up later</button>}
      <div className="spacer" />
      <p className="foot">Three refusals: this phone is skipped. Rosa can still tap Mail came on her phone, and Biscuit still reads letters.</p>
    </main>
  );

  return (
    <main className="screen">
      <div className="row between"><span className="label">{STEP[phase] || "Camera"}</span><span className="label plain">Spare phone</span></div>
      <h1 className="display small">
        {phase === "place" ? "Prop it on the windowsill, facing the mailbox." : phase === "looking" ? "Hold still. Looking for the mailbox." : phase === "found" ? "Is this your mailbox?" : phase === "wrong" ? "Tap your mailbox in the picture." : phase === "notfound" ? "I couldn't find a mailbox from here." : phase === "set" ? "Set. Now the envelope test." : "Opening the camera."}
      </h1>
      <div className={`frame ${phase === "wrong" ? "tappable" : ""}`} onClick={phase === "wrong" ? onTap : undefined}>
        <video ref={video} autoPlay playsInline muted />
        {overlay && <div className="region" style={overlay} />}
        {tap && phase === "wrong" && <div className="tapmark" style={{ left: `${tap.x * 100}%`, top: `${tap.y * 100}%` }} />}
        {phase === "looking" && <div className="scanline" />}
      </div>
      {phase === "found" && <section className="card status"><span className="pill signal">Observed</span><p className="lead small">A mailbox shape in the picture{score ? ` (confidence ${Math.round(score * 100)}%)` : ""}. Biscuit will watch only this box.</p></section>}
      {phase === "notfound" && <section className="card"><span className="label">Try this</span><p className="lead small">Move the phone so the box sits near the middle, and closer: as big as a coin on this screen. Glare on the glass: tilt the phone down a little.</p></section>}
      <div className="spacer" />
      {phase === "place" && <button type="button" className="btn" onClick={() => find()}>Find my mailbox</button>}
      {phase === "found" && <><button type="button" className="btn" onClick={confirm}>Yes, that's it</button><button type="button" className="btn secondary" onClick={() => { setWrongs(wrongs + 1); setTap(null); setPhase("wrong"); }}>No, that's not it</button></>}
      {phase === "wrong" && <><button type="button" className="btn" disabled={!tap} onClick={() => find(tap)}>Use what I tapped</button>{wrongs >= 2 ? <p className="lead small">Wrong twice: move the phone so only Rosa's box is in the picture, then look again.</p> : null}<button type="button" className="btn secondary" onClick={() => setPhase("place")}>Look again</button></>}
      {phase === "notfound" && <>{looks < 2 && <button type="button" className="btn" onClick={() => find()}>Look again <span className="hint">try 2 of 2</span></button>}<button type="button" className="btn secondary" onClick={() => { setTap(null); setPhase("wrong"); }}>Tap where it is</button>{looks >= 2 && <button type="button" className="btn secondary" onClick={() => { store.set({ cam: { skipped: true } }); navigate("/cam/rest"); }}>Set the camera up later</button>}</>}
      {phase === "set" && <button type="button" className="btn" onClick={() => navigate("/cam/test")}>Next: the envelope test</button>}
      <p className="foot mono">{phase === "place" ? "One picture to SAM 3.1 with the word “mailbox” · ask you to confirm · remember only the box region" : "Pictures from the search are thrown away after the check. Once set, only the box region is ever looked at."}</p>
    </main>
  );
}
