import React, { useEffect, useRef, useState } from "react";
import Dog from "../components/Dog.jsx";
import { frameCheck, postLetter, readLetter } from "../lib/api.js";
import { summaryOf } from "../lib/letters.js";
import { grabJpeg, openCamera, stopCamera } from "../lib/camera.js";
import { navigate } from "../lib/navigate.js";
import { speak, stopSpeaking } from "../lib/speech.js";
import { earCheck } from "../lib/ear.js";
import { store } from "../lib/store.js";

export function statusLine(check) {
  if (!check) return { pill: "Looking", text: "Hold the letter in the frame." };
  if (check.ok) return { pill: "Hold Still", text: "That's it! Hold still." };
  if (check.cutEdge) return { pill: "Not Yet", text: `A little closer. The ${check.cutEdge} is cut off.` };
  if (check.coverage > 0) return { pill: "Not Yet", text: "A little closer." };
  return { pill: "Looking", text: "Hold the letter in the frame." };
}

export default function Letter() {
  const video = useRef(null);
  const stream = useRef(null);
  const busy = useRef(false);
  const [check, setCheck] = useState(null);
  const [phase, setPhase] = useState("looking");
  const [shot, setShot] = useState("");
  // What the frame check says is also said aloud, once per change and not more than every three seconds.
  const spoken = useRef({ text: "", at: 0 });

  async function capture() {
    if (busy.current) return;
    busy.current = true;
    setPhase("reading");
    try {
      const jpeg = await grabJpeg(video.current, 2000, 2_000_000);
      // The picture is taken: the camera stops and the screen shows the picture Biscuit is reading.
      stopCamera(stream.current);
      setShot(URL.createObjectURL(jpeg));
      speak(["Got it! One moment while I read."]);
      const r = await readLetter(jpeg);
      // The whole reading stays with the letter on this phone so a tap on Your papers can play it again, and so Rosa can overrule a wrong "not to you"; what leaves the phone for someone else's letter is a date, a kind and the status (summaryOf).
      const entry = { ...r, id: crypto.randomUUID(), readAt: new Date().toISOString(), status: r.mismatch ? "not_mine" : "read", needsReview: Boolean(r.mismatch), checks: r.checks || [], readers: r.readers || [] };
      store.set((s) => ({ docket: [entry, ...s.docket], lastReading: { ...r, id: entry.id }, lookRequest: s.lookRequest && s.lookRequest.sender === r.sender ? null : s.lookRequest }));
      if (store.get().household?.shareLetters !== false) postLetter(summaryOf(entry)).catch(() => {});
      navigate("/reading");
    } catch (err) {
      const line = err?.status === 422 ? "I can't read this one. Keep it for Ana." : err?.status === 503 ? "Both my readers are away. Let's try again in a minute." : err?.status === 429 ? "I've read a lot this hour. Let's try again a little later." : "Something went wrong reading that. Let's try again.";
      await speak([line]);
      navigate("/");
    } finally {
      busy.current = false;
    }
  }

  useEffect(() => {
    let alive = true;
    let timer = null;
    (async () => {
      try {
        stream.current = await openCamera(video.current);
        // The ear keeps listening here too; if the phone hands the camera over to the microphone, the camera is reopened once.
        const reopen = async () => { if (!alive) return; try { stream.current = await openCamera(video.current); } catch { /* the frame stays */ } };
        stream.current.getVideoTracks().forEach((t) => { t.onended = reopen; });
        setTimeout(() => { if (alive) earCheck(); }, 600);
        speak(["Show me the letter! Hold it in the frame and I'll snap it when it's clear."]);
      } catch {
        await speak(["I can't see. Allow the camera for Biscuit and try again."]);
        navigate("/");
        return;
      }
      timer = setInterval(async () => {
        if (!alive || busy.current || !video.current?.videoWidth) return;
        try {
          busy.current = true;
          const result = await frameCheck(await grabJpeg(video.current, 1280, 300_000));
          busy.current = false;
          if (!alive) return;
          setCheck(result);
          const line = statusLine(result).text;
          if (line !== spoken.current.text && Date.now() - spoken.current.at > 3000 && line !== "Hold the letter in the frame.") { spoken.current = { text: line, at: Date.now() }; speak([line]); }
          if (result.ok) { clearInterval(timer); await capture(); }
        } catch {
          busy.current = false;
        }
      }, 1000);
    })();
    return () => { alive = false; if (timer) clearInterval(timer); stopCamera(stream.current); stopSpeaking(); if (shot) URL.revokeObjectURL(shot); };
  }, []);

  const s = statusLine(check);
  return (
    <main className="screen">
      <div className="row between"><span className="label">Show Me the Letter</span><a href="/" className="link" onClick={(e) => { e.preventDefault(); navigate("/"); }}>Stop</a></div>
      {phase === "reading" ? (
        <>
          <div className="row"><Dog /><h1 className="display small">Reading It Now.</h1></div>
          {shot && <img className="shot" src={shot} alt="The letter Biscuit is reading" />}
        </>
      ) : (
        <>
          <h1 className="display small">Hold the letter in the frame.</h1>
          <div className="frame"><video ref={video} autoPlay playsInline muted /></div>
          <section className="card status"><span className={`pill ${check?.ok ? "ok" : "warn"}`}>{s.pill}</span><p className="lead small">{s.text}</p></section>
        </>
      )}
      <div className="spacer" />
      {phase !== "reading" && <button type="button" className="btn big" onClick={capture}>Take the Picture</button>}
    </main>
  );
}
