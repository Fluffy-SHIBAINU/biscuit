import React, { useEffect, useRef, useState } from "react";
import Dog from "../components/Dog.jsx";
import { api, transcribe } from "../lib/api.js";
import { navigate } from "../lib/navigate.js";
import { listen, speak, stopSpeaking } from "../lib/speech.js";
import { releaseEar } from "../lib/ear.js";
import { handleVoiceCommand } from "../lib/commands.js";
import { answerFrom } from "../lib/answers.js";
import { store, useStore } from "../lib/store.js";

export default function Question() {
  const s = useStore();
  const r = s.lastReading;
  const [questions, setQuestions] = useState(null);
  const [index, setIndex] = useState(0);
  const [listening, setListening] = useState(false);
  const alive = useRef(true);

  useEffect(() => {
    alive.current = true;
    if (!r) { navigate("/"); return; }
    const known = Object.keys(s.answers[r.id] || {});
    api("/question", { method: "POST", json: { kind: r.kind, hasSheet: Boolean(r.sheet?.freeCare), known } })
      .then((res) => { if (alive.current) setQuestions(res.questions); })
      .catch(() => { if (alive.current) setQuestions([]); });
    return () => { alive.current = false; stopSpeaking(); releaseEar(); };
  }, []);

  const q = questions?.[index];

  useEffect(() => {
    if (!q) { if (questions && !q) navigate("/offer"); return; }
    (async () => {
      await speak([q.text]);
      if (!alive.current || s.buttonsMode) return;
      setListening(true);
      try {
        const { blob, spoke } = await listen();
        const text = spoke ? await transcribe(blob) : "";
        if (!alive.current) return;
        if (handleVoiceCommand(text)) return;
        const a = answerFrom(text);
        if (a) record(a);
      } catch { /* fall back to the buttons */ } finally { if (alive.current) setListening(false); }
    })();
  }, [q?.id]);

  function record(answer) {
    store.set((st) => ({ answers: { ...st.answers, [r.id]: { ...(st.answers[r.id] || {}), [q.id]: answer } } }));
    stopSpeaking();
    setIndex(index + 1);
  }

  if (!r) return null;
  return (
    <main className="screen">
      <div className="row between"><span className="label">One question</span><a href="/" className="link" onClick={(e) => { e.preventDefault(); stopSpeaking(); navigate("/"); }}>Stop</a></div>
      <div className="row"><Dog size={56} /><h1 className="display small">{q ? q.text : questions ? "No questions this time." : "One moment."}</h1></div>
      {q && listening && <p className="lead small muted">Listening. You can just say yes or no.</p>}
      <div className="spacer" />
      {q && q.id === "Q2" ? (
        <div className="grid3">{["1", "2", "3", "4", "5", "6"].map((n) => <button key={n} type="button" className="btn secondary" onClick={() => record(n)}>{n}</button>)}</div>
      ) : q ? (
        <>
          <button type="button" className="btn big" onClick={() => record("yes")}>Yes</button>
          <button type="button" className="btn secondary" onClick={() => record("no")}>No</button>
          <button type="button" className="btn secondary" onClick={() => record("unsure")}>Not sure</button>
        </>
      ) : null}
      <p className="foot">Your answers stay on this phone. They help Biscuit know what to do next.</p>
    </main>
  );
}
