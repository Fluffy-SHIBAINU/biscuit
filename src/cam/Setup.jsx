import React, { useEffect, useRef, useState } from "react";
import { grabJpeg, openCamera, stopCamera } from "../lib/camera.js";
import { findMailbox, padRegion, setRegion } from "../lib/camapi.js";
import { navigate, useSearch } from "../lib/navigate.js";
import { speak } from "../lib/speech.js";
import { store, useStore } from "../lib/store.js";
import { regionStyle, roundBox, videoSizeOf } from "./box.js";
import BoxEditor from "./BoxEditor.jsx";

const STEP = { denied: "Camera · 1 of 3 · can't see", place: "Camera · 2 of 3 · live", looking: "Camera · 3 of 3 · looking", found: "Camera · 3 of 3 · found", wrong: "Camera · 3 of 3 · tap the box", notfound: "Camera · 3 of 3 · not found", draw: "Camera · 3 of 3 · draw the box" };

export default function Setup() {
  const s = useStore();
  const search = useSearch();
  const video = useRef(null);
  const stream = useRef(null);
  const [phase, setPhase] = useState("opening");
  const [box, setBox] = useState(null);
  const [score, setScore] = useState(null);
  const [refusals, setRefusals] = useState(s.camRefusals || 0);
  const [looks, setLooks] = useState(0);
  const [wrongs, setWrongs] = useState(0);
  const [tap, setTap] = useState(null);
  // The box drawn by hand, in the video's coordinates; whether it adjusts a box already in use (from the Watching screen); where the editor's second button leads.
  const [drawn, setDrawn] = useState(null);
  const [adjusting, setAdjusting] = useState(false);
  const [back, setBack] = useState("place");
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  // ?draw=1 (the Watching screen's "Adjust the box") opens on the editor with the box in use.
  const wantsDraw = new URLSearchParams(search).get("draw") === "1";

  // Where the editor's second button leads: back to the live view, back to SAM's box, or (adjusting) back to watching.
  function startDraw(initial, { adjust = false, from = "place" } = {}) {
    setDrawn(initial); setAdjusting(adjust); setBack(from); setTap(null); setFailed(false); setPhase("draw");
  }

  async function open() {
    setPhase("opening");
    try {
      stream.current = await openCamera(video.current);
      try { await navigator.wakeLock?.request("screen"); } catch { /* optional */ }
      if (wantsDraw) startDraw(s.cam?.region || null, { adjust: Boolean(s.cam?.region) }); else setPhase("place");
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

  // The box as it will be watched: SAM's find padded by a fifth, or the person's own drawing as drawn. Either way the phone
  // goes straight to watching. The rest of the camera settings on this phone (collect mode) stay.
  async function save(region, source) {
    setBusy(true); setFailed(false);
    try {
      await setRegion(region, source);
      store.set((st) => ({ cam: { ...(st.cam || {}), region, regionSource: source, setAt: new Date().toISOString(), skipped: false } }));
      speak(["Set. I'll watch only this box."]);
      navigate("/cam");
    } catch {
      setFailed(true);
    } finally { setBusy(false); }
  }
  const confirm = () => save(padRegion(box), "sam");
  const useDrawn = () => save(roundBox(drawn), "hand");

  function onTap(e) {
    const rect = e.currentTarget.getBoundingClientRect();
    const p = { x: (e.clientX - rect.left) / rect.width, y: (e.clientY - rect.top) / rect.height };
    setTap(p);
  }

  const overlay = phase === "found" && box ? regionStyle(box, videoSizeOf(video.current)) : null;
  const drawMyself = (label = "Draw the box myself") => <button type="button" className="btn secondary" onClick={() => startDraw(null)}>{label}</button>;

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
        {phase === "place" ? "Prop it on the windowsill, facing the mailbox." : phase === "looking" ? "Hold still. Looking for the mailbox." : phase === "found" ? "Is this your mailbox?" : phase === "wrong" ? "Tap your mailbox in the picture." : phase === "notfound" ? "I couldn't find a mailbox from here." : phase === "draw" ? (drawn ? "Drag a corner to resize. Drag inside to move." : "Draw a box around the mailbox.") : "Opening the camera."}
      </h1>
      <div className={`frame ${phase === "wrong" ? "tappable" : ""}`} onClick={phase === "wrong" ? onTap : undefined}>
        <video ref={video} autoPlay playsInline muted />
        {overlay && <div className="region" style={overlay} />}
        {phase === "draw" && <BoxEditor initial={drawn} video={video} onChange={setDrawn} />}
        {tap && phase === "wrong" && <div className="tapmark" style={{ left: `${tap.x * 100}%`, top: `${tap.y * 100}%` }} />}
        {phase === "looking" && <div className="scanline" />}
      </div>
      {phase === "found" && <section className="card status"><span className="pill signal">Observed</span><p className="lead small">A mailbox shape in the picture{score ? ` (confidence ${Math.round(score * 100)}%)` : ""}. Biscuit will watch only this box.</p></section>}
      {phase === "notfound" && <section className="card"><span className="label">Try this</span><p className="lead small">Move the phone so the box sits near the middle, and closer: as big as a coin on this screen. Glare on the glass: tilt the phone down a little.</p></section>}
      {phase === "draw" && <section className="card"><span className="label">{drawn ? "Your box" : "Draw it"}</span><p className="lead small">{drawn ? "Leave a little room around the mailbox: the lid and the carrier's hand should fit inside. Drag outside the box to draw a new one." : "Put one finger on the picture and drag a box around the mailbox, with a little room around it: the lid and the carrier's hand should fit inside."}</p></section>}
      {failed && <p className="lead small bad">Couldn't save the box. Check the connection and try again.</p>}
      <div className="spacer" />
      {phase === "place" && <><button type="button" className="btn" onClick={() => find()}>Find my mailbox</button>{drawMyself()}</>}
      {phase === "found" && <><button type="button" className="btn" disabled={busy} onClick={confirm}>Yes, that's it</button><button type="button" className="btn secondary" onClick={() => { setWrongs(wrongs + 1); setTap(null); setPhase("wrong"); }}>No, that's not it</button><button type="button" className="btn secondary" onClick={() => startDraw(padRegion(box), { from: "found" })}>Adjust it by hand</button></>}
      {phase === "wrong" && <><button type="button" className="btn" disabled={!tap} onClick={() => find(tap)}>Use what I tapped</button>{wrongs >= 2 ? <p className="lead small">Wrong twice: move the phone so only Rosa's box is in the picture, then look again.</p> : null}{drawMyself()}<button type="button" className="btn secondary" onClick={() => setPhase("place")}>Look again</button></>}
      {phase === "notfound" && <>{looks < 2 && <button type="button" className="btn" onClick={() => find()}>Look again <span className="hint">try 2 of 2</span></button>}<button type="button" className="btn secondary" onClick={() => { setTap(null); setPhase("wrong"); }}>Tap where it is</button>{drawMyself()}{looks >= 2 && <button type="button" className="btn secondary" onClick={() => { store.set({ cam: { skipped: true } }); navigate("/cam/rest"); }}>Set the camera up later</button>}</>}
      {phase === "draw" && <><button type="button" className="btn" disabled={!drawn || busy} onClick={useDrawn}>Use this box</button>{adjusting ? <button type="button" className="btn secondary" onClick={() => navigate("/cam")}>Keep the box as it is</button> : back === "found" ? <button type="button" className="btn secondary" onClick={() => setPhase("found")}>Back to what Biscuit found</button> : <button type="button" className="btn secondary" onClick={() => setPhase("place")}>Find it for me instead</button>}</>}
      <p className="foot mono">{phase === "place" ? "One picture to SAM 3.1 with the word “mailbox” · ask you to confirm · remember only the box region" : phase === "draw" ? "Nothing is sent while you draw · the box is kept as you drew it, no padding · once set, only the box is ever looked at" : "Pictures from the search are thrown away after the check. Once set, only the box region is ever looked at."}</p>
    </main>
  );
}
