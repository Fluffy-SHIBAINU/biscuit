import React, { useEffect, useRef, useState } from "react";
import Dog from "../components/Dog.jsx";
import { patchLetter, postEvent, postLetter, transcribe } from "../lib/api.js";
import { readOnceLine, summaryOf } from "../lib/letters.js";
import { navigate } from "../lib/navigate.js";
import { listen, speak, speakAndKeep, stopSpeaking } from "../lib/speech.js";
import { releaseEar } from "../lib/ear.js";
import { handleVoiceCommand } from "../lib/commands.js";
import { saidMine, saidWrong } from "../lib/talk.js";
import { store, useStore } from "../lib/store.js";

export const FIELD_LABEL = { sender: "From", hospital_name: "Hospital", amount_due: "Amount Due", statement_date: "Statement Date", due_date: "Due Date", financial_assistance: "Financial Assistance", phone_numbers: "Phone number", account_last4: "Account" };
const READ_PILL = { twice: ["ok", "Read twice ✓"], once: ["warn", "Read once"] };

/** One fact row: the value over its quote, and what the two readers made of it. */
export function Fact({ f, readBy }) {
  const label = FIELD_LABEL[f.field] || f.field;
  if (!f.verified) return <div className="fact unverified"><span className="label plain">{label}</span><strong>{f.value}</strong><span className="label plain">Unverified, Not Spoken</span></div>;
  if (f.agreement === "differ") {
    return (
      <div className="fact differ">
        <span className="label plain">{label}</span>
        <strong>Not said aloud</strong>
        <span className="row wrap"><span className="pill warn">Differ</span><span className="seen">Read two ways: <span className="quote"><span className="mark">“{f.quote}”</span></span> and <span className="quote"><span className="mark">“{f.other?.quote}”</span></span>. Ana will check.</span></span>
      </div>
    );
  }
  return (
    <div className="fact">
      <span className="label plain">{label}</span>
      <strong>{f.value}</strong>
      <span className="quote"><span className="mark">“{f.quote}”</span></span>
      {f.agreement === "agreed" && <span className="agree">Both readers: the same line</span>}
      {f.agreement === "once" && readBy === "twice" && <span className="seen">One reader saw this · not said</span>}
    </div>
  );
}

export default function Reading() {
  const s = useStore();
  const r = s.lastReading;
  const alive = useRef(true);
  const [asked, setAsked] = useState(false);

  /** Rosa overrules "not to you": the letter becomes hers, the reading plays, and the full summary goes to Ana's page. */
  function claimAsMine() {
    if (!r?.mine) return;
    stopSpeaking();
    const entry = { ...r, mismatch: false, status: "read", needsReview: false, lines: r.mine.lines, offerLines: r.mine.offerLines };
    store.set((st) => ({ docket: st.docket.map((l) => (l.id === r.id ? { ...l, ...entry } : l)), lastReading: entry }));
    if (store.get().household?.shareLetters !== false) postLetter(summaryOf(entry)).catch(() => {});
    setAsked(false);
  }

  /** After the reading: "Did I get anything wrong?" A complaint becomes a note for Ana and a mark on the letter; a no, or silence, goes on. */
  async function askIfWrong() {
    if (!alive.current || s.buttonsMode) return;
    setAsked(true);
    await speak(["Did I get anything wrong?"]);
    if (!alive.current) return;
    try {
      const { blob, spoke, displaced } = await listen();
      // A newer question (a tap on Something's wrong) took over this wait: it is not silence, so nothing moves on.
      if (displaced) return;
      const text = spoke ? await transcribe(blob) : "";
      if (!alive.current || handleVoiceCommand(text)) return;
      if (saidWrong(text)) {
        await speak(["Tell me what, and I'll pass it to Ana."]);
        const second = await listen();
        if (second.displaced) return;
        const words = second.spoke ? await transcribe(second.blob) : "";
        if (!alive.current || handleVoiceCommand(words)) return;
        const note = words.trim() ? `About the letter from ${r.sender || "a sender"}: ${words.trim()}` : `The reading of the letter from ${r.sender || "a sender"} was wrong.`;
        postEvent("rosa_said", { text: note.slice(0, 300) }).catch(() => {});
        patchLetter(r.id, { needsReview: true }).catch(() => {});
        store.set((st) => ({ docket: st.docket.map((l) => (l.id === r.id ? { ...l, needsReview: true } : l)) }));
        await speak(["I've told Ana to check it."]);
      }
      if (alive.current) navigate("/question");
    } catch { /* the buttons remain */ }
  }

  /** On "not to you": Rosa can say it's mine. */
  async function askIfMine() {
    if (!alive.current || s.buttonsMode) return;
    await speak(["If this letter is yours after all, say it's mine, and I'll read it."]);
    if (!alive.current) return;
    try {
      const { blob, spoke, displaced } = await listen();
      if (displaced) return;
      const text = spoke ? await transcribe(blob) : "";
      if (!alive.current || handleVoiceCommand(text)) return;
      if (saidMine(text)) claimAsMine();
      else if (text.trim()) navigate("/docket");
    } catch { /* the buttons remain */ }
  }

  useEffect(() => {
    alive.current = true;
    (async () => {
      if (r?.lines?.length) await speakAndKeep(r.lines);
      if (!alive.current || !r) return;
      if (r.mismatch) await askIfMine(); else if (!asked) await askIfWrong();
    })();
    return () => { alive.current = false; stopSpeaking(); releaseEar(); };
  }, [r?.id, r?.mismatch]);

  if (!r) { navigate("/"); return null; }
  const pill = READ_PILL[r.readBy];
  return (
    <main className="screen">
      <div className="row between"><span className="row"><span className="label">Biscuit Reads It</span>{pill && <span className={`pill ${pill[0]}`}>{pill[1]}</span>}</span><a href="/" className="link" onClick={(e) => { e.preventDefault(); stopSpeaking(); navigate("/"); }}>Stop</a></div>
      <div className="row"><Dog size={56} /><h1 className="display small">{r.lines?.[0] || "Here's what it says."}</h1></div>
      {r.readBy === "once" && (
        <section className="card">
          <span className="label">Read Once</span>
          <p className="lead small">{readOnceLine(r.readers)}</p>
        </section>
      )}
      <section className="card">
        <span className="label">What Biscuit Says</span>
        {(r.lines || []).map((line, i) => <p key={i} className="lead small">{line}</p>)}
      </section>
      {!r.mismatch && (
        <section className="card facts">
          <span className="label">Each Fact, Over Its Quote</span>
          {(r.facts || []).map((f, i) => <Fact key={i} f={f} readBy={r.readBy} />)}
        </section>
      )}
      <div className="spacer" />
      {r.mismatch && r.mine && <button type="button" className="btn big" onClick={claimAsMine}>It's Mine, Read It</button>}
      <button type="button" className={`btn ${r.mismatch ? "secondary" : "big"}`} onClick={() => { stopSpeaking(); navigate(r.mismatch ? "/docket" : "/question"); }}>{r.mismatch ? "All Right" : "Go On"}</button>
      {!r.mismatch && <button type="button" className="btn secondary" onClick={() => { stopSpeaking(); askIfWrong(); }}>Something's Wrong</button>}
      <button type="button" className="btn secondary" onClick={() => { stopSpeaking(); navigate("/"); }}>Done</button>
    </main>
  );
}
