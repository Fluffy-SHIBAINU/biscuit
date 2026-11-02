import React, { useEffect, useRef, useState } from "react";
import Dog from "../components/Dog.jsx";
import { api } from "../lib/api.js";
import { navigate } from "../lib/navigate.js";
import { stopSpeaking } from "../lib/speech.js";
import { releaseEar } from "../lib/ear.js";
import { askChoices, cancelChoices } from "../lib/hear.js";
import { answerFrom } from "../lib/answers.js";

const YES_NO = [
  { key: "yes", say: "yes", match: (t) => answerFrom(t) === "yes" },
  { key: "no", say: "no", match: (t) => answerFrom(t) === "no" },
  { key: "unsure", say: "not sure", match: (t) => answerFrom(t) === "unsure" },
];
const NUMBERS = ["1", "2", "3", "4", "5", "6"].map((n) => ({ key: n, say: n, match: (t) => answerFrom(t) === n }));
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
    return () => { alive.current = false; stopSpeaking(); cancelChoices(); releaseEar(); };
  }, []);

  const q = questions?.[index];

  useEffect(() => {
    if (!q) { if (questions && !q) navigate("/offer"); return; }
    (async () => {
      // Biscuit asks, says the options, and only those options are an answer; the buttons stay as helpers.
      setListening(true);
      const key = await askChoices({ lines: [q.text], options: q.id === "Q2" ? NUMBERS : YES_NO, alive: () => alive.current });
      if (alive.current) setListening(false);
      if (key && alive.current) record(key);
    })();
  }, [q?.id]);

  function record(answer) {
    cancelChoices();
    store.set((st) => ({ answers: { ...st.answers, [r.id]: { ...(st.answers[r.id] || {}), [q.id]: answer } } }));
    stopSpeaking();
    setIndex(index + 1);
  }

  if (!r) return null;
  return (
    <main className="screen">
      <div className="row between"><span className="label">One Question</span><a href="/" className="link" onClick={(e) => { e.preventDefault(); stopSpeaking(); navigate("/"); }}>Stop</a></div>
      <div className="row"><Dog size={56} /><h1 className="display small">{q ? q.text : questions ? "No questions this time." : "One moment."}</h1></div>
      {q && listening && <p className="lead small muted">{q.id === "Q2" ? "Say a number, one to six. Count yourself." : "Say yes, no, or not sure."}</p>}
      <div className="spacer" />
      {q && q.id === "Q2" ? (
        <div className="grid3">{["1", "2", "3", "4", "5", "6"].map((n) => <button key={n} type="button" className="btn secondary" onClick={() => record(n)}>{n}</button>)}</div>
      ) : q ? (
        <>
          <button type="button" className="btn big" onClick={() => record("yes")}>Yes</button>
          <button type="button" className="btn secondary" onClick={() => record("no")}>No</button>
          <button type="button" className="btn secondary" onClick={() => record("unsure")}>Not Sure</button>
        </>
      ) : null}
    </main>
  );
}
