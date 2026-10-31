import React, { useEffect, useRef, useState } from "react";
import Dog from "../components/Dog.jsx";
import { postEvent, transcribe } from "../lib/api.js";
import { statusLine } from "../lib/letters.js";
import { navigate } from "../lib/navigate.js";
import { listen, speak, stopSpeaking } from "../lib/speech.js";
import { handleVoiceCommand } from "../lib/commands.js";
import { MENU_LINES } from "../lib/talk.js";
import { useTalk } from "../lib/talkState.js";
import { store, useStore } from "../lib/store.js";

/** Kept for the older tests: the line Biscuit says back when the words were not a move. */
export function replyTo(text) {
  const t = (text || "").trim();
  if (!t) return "I didn't catch that. Hold the phone closer and try again.";
  return `I heard: ${t.replace(/[.?!]+$/, "")}. ${MENU_LINES.join(" ")}`;
}

/**
 * The conversation screen. Biscuit hears all the time now (the bar at the foot), so this page only shows the last thing
 * said each way and keeps the buttons as helpers: a letter, the papers, a message for Ana.
 */
export default function Talk() {
  const s = useStore();
  const t = useTalk();
  const [asking, setAsking] = useState(false);
  const alive = useRef(true);
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);

  async function askWhatToTell() {
    setAsking(true);
    await speak(["What shall I tell her?"]);
    if (!alive.current) return;
    try {
      const { blob, spoke } = await listen();
      const text = spoke ? await transcribe(blob) : "";
      if (!alive.current || handleVoiceCommand(text)) return;
      if (!text.trim()) { await speak(["I didn't catch that. Tap Tell Ana and say it again."]); return; }
      postEvent("rosa_said", { text: text.trim().slice(0, 300) }).catch(() => {});
      await speak([`I told Ana: ${text.trim()}.`]);
    } catch { if (alive.current) await speak(["I couldn't hear you. Check the microphone and try again."]); }
    finally { if (alive.current) setAsking(false); }
  }

  const readPapers = () => {
    const letters = store.get().docket.filter((l) => l.status !== "hidden");
    speak(letters.length ? letters.map((l) => `${l.sender || "A letter"}. ${statusLine(l)}`) : ["Nothing on your papers yet."]).then(() => { if (alive.current) navigate("/docket"); });
  };

  const name = s.household?.called || "Rosa";
  return (
    <main className="screen">
      <div className="row between"><span className="label">Biscuit · Kindred</span><a href="/" className="link" onClick={(e) => { e.preventDefault(); stopSpeaking(); navigate("/"); }}>Home</a></div>
      <div className="row"><Dog /><h1 className="display">{asking ? "I'm all ears!" : `Just talk to me, ${name}.`}</h1></div>
      {t.heard && <section className="card"><span className="label">You said</span><p className="lead quote">“{t.heard}”</p></section>}
      {t.reply && <section className="card"><span className="label">Biscuit says</span><p className="lead">{t.reply}</p></section>}
      <div className="spacer" />
      <button type="button" className="btn big" onClick={() => { stopSpeaking(); navigate("/letter"); }}>Read a letter</button>
      <div className="row pair">
        <button type="button" className="btn secondary" onClick={() => { stopSpeaking(); readPapers(); }}>My papers</button>
        <button type="button" className="btn secondary" onClick={() => { stopSpeaking(); askWhatToTell(); }} disabled={asking}>Tell Ana</button>
      </div>
      <p className="foot">Biscuit listens while this phone is open; the bar below shows it and pauses it. Your voice is turned into words and not kept; what you ask him to tell Ana is kept for her, in your words.</p>
    </main>
  );
}
