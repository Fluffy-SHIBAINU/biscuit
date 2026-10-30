import React, { useEffect, useRef, useState } from "react";
import Dog from "../components/Dog.jsx";
import { api, postEvent, transcribe } from "../lib/api.js";
import { statusLine } from "../lib/letters.js";
import { navigate } from "../lib/navigate.js";
import { listen, speak, stopSpeaking } from "../lib/speech.js";
import { handleVoiceCommand, triggerHelpByVoice } from "../lib/commands.js";
import { MENU_LINES, intentOf } from "../lib/talk.js";
import { store, useStore } from "../lib/store.js";

/** Kept for the older tests: the line Biscuit says back when the words were not a move. */
export function replyTo(text) {
  const t = (text || "").trim();
  if (!t) return "I didn't catch that. Hold the phone closer and try again.";
  return `I heard: ${t.replace(/[.?!]+$/, "")}. ${MENU_LINES.join(" ")}`;
}

export default function Talk() {
  const s = useStore();
  const [phase, setPhase] = useState("listening");
  const [heard, setHeard] = useState("");
  const [reply, setReply] = useState("");
  const [level, setLevel] = useState(0);
  const alive = useRef(true);
  // The conversation so far, on this phone only: the last turns go with each question so Biscuit can follow along.
  const history = useRef([]);
  const nowLocal = () => new Date().toLocaleString([], { weekday: "long", hour: "numeric", minute: "2-digit" });
  // The talk goes on by itself after each reply; two quiet turns in a row and Biscuit stops listening until the next tap.
  const quiet = useRef(0);

  const say = async (lines, { again = true } = {}) => { setReply(lines.join(" ")); setPhase("speaking"); await speak(lines); if (!alive.current) return; setPhase("done"); if (again) turn(); };

  /** Rosa's words go to Ana's page as what Rosa said, in her words, by her choice, each time. */
  async function tellAna(text) {
    const words = (text || "").trim();
    if (!words) { await askWhatToTell(); return; }
    postEvent("rosa_said", { text: words.slice(0, 300) }).catch(() => {});
    quiet.current = 0;
    await say([`I told Ana: ${words}.`, "Anything else?"]);
  }

  async function askWhatToTell() {
    setPhase("speaking"); setReply("What shall I tell her?");
    await speak(["What shall I tell her?"]);
    if (!alive.current) return;
    setPhase("listening"); setHeard("");
    try {
      const { blob, spoke } = await listen({ onLevel: setLevel });
      if (!alive.current) return;
      setPhase("thinking");
      const text = spoke ? await transcribe(blob) : "";
      if (!alive.current) return;
      setHeard(text);
      if (handleVoiceCommand(text)) return;
      if (!text.trim()) { await say(["I didn't catch that. Tap Tell Ana and say it again."], { again: false }); return; }
      await tellAna(text);
    } catch { if (alive.current) await say(["I couldn't hear you. Check the microphone and try again."]); }
  }

  /** The words become a move: a letter, the papers, the mail, a message for Ana, or the menu. */
  async function act(text) {
    const { intent, text: message } = intentOf(text);
    if (intent === "letter") { await speak(["Show me the letter."]); if (alive.current) navigate("/letter"); return; }
    if (intent === "papers") {
      const letters = store.get().docket.filter((l) => l.status !== "hidden");
      await speak(letters.length ? letters.map((l) => `${l.sender || "A letter"}. ${statusLine(l)}`) : ["Nothing on your papers yet."]);
      if (alive.current) navigate("/docket");
      return;
    }
    if (intent === "mail") { navigate("/mail?from=home"); return; }
    if (intent === "tell") { await tellAna(message); return; }
    if (intent === "nothing") {
      quiet.current += 1;
      if (quiet.current >= 2) { await say(["I'll stop listening for now. Tap Talk when you want me."], { again: false }); return; }
      await say(["I didn't catch that. Say it again?"]);
      return;
    }
    quiet.current = 0;
    await companion(text);
  }

  /** Anything else is a conversation: the companion answers in Biscuit's voice, remembers what she tells him, and does a job when the words are one. */
  async function companion(text) {
    const turns = [...history.current, { role: "user", content: text }].slice(-12);
    let r;
    try { r = await api("/companion", { method: "POST", json: { messages: turns, nowLocal: nowLocal() } }); }
    catch { await say(["I lost my train of thought. Say that again?"]); return; }
    if (!alive.current) return;
    history.current = [...turns, { role: "assistant", content: r.reply }].slice(-12);
    const after = r.action === "read_letter" ? "/letter" : r.action === "papers" ? "/docket" : r.action === "mail_came" ? "/mail?from=home" : null;
    if (r.action === "help") { triggerHelpByVoice(); return; }
    if (after) { setReply(r.reply); setPhase("speaking"); await speak([r.reply]); if (alive.current) navigate(after); return; }
    await say([r.reply]);
  }


  async function turn() {
    setPhase("listening"); setHeard(""); setReply("");
    try {
      const { blob, spoke } = await listen({ onLevel: setLevel });
      if (!alive.current) return;
      setPhase("thinking");
      const text = spoke ? await transcribe(blob) : "";
      if (!alive.current) return;
      setHeard(text);
      if (handleVoiceCommand(text)) return;
      await act(text);
    } catch (err) {
      if (!alive.current) return;
      await say([err?.status === 401 ? "This phone isn't linked yet. Ask Ana." : "I couldn't hear you. Check the microphone and try again."], { again: false });
    }
  }

  useEffect(() => { alive.current = true; turn(); return () => { alive.current = false; stopSpeaking(); }; }, []);

  const name = s.household?.called || "Rosa";
  return (
    <main className="screen">
      <div className="row between"><span className="label">Biscuit · Kindred</span><a href="/" className="link" onClick={(e) => { e.preventDefault(); stopSpeaking(); navigate("/"); }}>Stop</a></div>
      <div className="row"><Dog /><h1 className="display">{phase === "listening" ? "I'm all ears!" : phase === "thinking" ? "One moment." : phase === "speaking" ? "Here's what I'll do." : `What next, ${name}?`}</h1></div>
      {phase === "listening" && <div className="bars" aria-hidden="true">{[0, 1, 2, 3].map((i) => <span key={i} className={level ? "on" : ""} />)}</div>}
      {heard && <section className="card"><span className="label">You said</span><p className="lead quote">“{heard}”</p></section>}
      {reply && <section className="card"><span className="label">Biscuit says</span><p className="lead">{reply}</p></section>}
      <div className="spacer" />
      <button type="button" className="btn big" onClick={() => { stopSpeaking(); navigate("/letter"); }}>Read a letter</button>
      <div className="row pair">
        <button type="button" className="btn secondary" onClick={() => { stopSpeaking(); navigate("/docket"); }}>My papers</button>
        <button type="button" className="btn secondary" onClick={() => { stopSpeaking(); askWhatToTell(); }}>Tell Ana</button>
      </div>
      {phase === "done" && <button type="button" className="btn secondary" onClick={() => { quiet.current = 0; turn(); }}>Talk again</button>}
      <button type="button" className="btn secondary" onClick={() => { stopSpeaking(); navigate("/"); }}>Done</button>
      <p className="foot">Biscuit listens only after you tap Talk. Your voice is turned into words and not kept; what you ask him to tell Ana is kept for her, in your words.</p>
    </main>
  );
}
