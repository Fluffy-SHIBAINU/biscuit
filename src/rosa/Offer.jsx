import React, { useEffect, useRef, useState } from "react";
import Dog from "../components/Dog.jsx";
import { handoff, patchLetter, transcribe } from "../lib/api.js";
import { navigate } from "../lib/navigate.js";
import { listen, speak, speakAndKeep, stopSpeaking } from "../lib/speech.js";
import { handleVoiceCommand } from "../lib/commands.js";
import { store, useStore } from "../lib/store.js";

function setStatus(id, status, extra = {}) {
  store.set((s) => ({ docket: s.docket.map((l) => (l.id === id ? { ...l, status, ...extra } : l)) }));
}

export default function Offer() {
  const s = useStore();
  const r = s.lastReading;
  const [busy, setBusy] = useState(false);
  const alive = useRef(true);
  const mode = !r ? "none" : r.unknownNumber ? "unknown" : r.kind === "ad" ? "ad" : r.kind === "bill" && r.sheet?.freeCare ? "offer" : r.kind === "bill" ? "send" : "keep";
  const lines = !r ? [] : mode === "offer" || mode === "unknown" || mode === "send" ? r.offerLines : mode === "ad" ? ["Shall I toss it?"] : ["I'll keep it on your papers."];

  useEffect(() => {
    alive.current = true;
    if (!r) { navigate("/"); return; }
    (async () => {
      await speakAndKeep(lines);
      if (!alive.current || s.buttonsMode || !(mode === "offer" || mode === "ad" || mode === "send" || mode === "unknown")) return;
      try {
        const { blob, spoke } = await listen();
        const text = spoke ? await transcribe(blob) : "";
        if (!alive.current) return;
        if (handleVoiceCommand(text)) return;
        if (/\b(yes|yeah|yep|please|go ahead|toss)\b/i.test(text)) yes();
        else if (/\b(no|nope|not now|keep)\b/i.test(text)) no();
      } catch { /* buttons remain */ }
    })();
    return () => { alive.current = false; stopSpeaking(); };
  }, [r?.id]);

  async function yes() {
    if (busy || !r) return;
    setBusy(true); stopSpeaking();
    try {
      if (mode === "offer") {
        const { waiveUrl } = await handoff(r.id, r.hospital.ccn);
        setStatus(r.id, "handoff", { waiveUrl, waitingLine: `${r.hospital.name}'s application. Ana has it on her page.` });
        await speak(["Done! Ana has it on her page. I'll tell you when the hospital answers."]);
      } else if (mode === "ad") {
        await patchLetter(r.id, { status: "tossed" }).catch(() => {});
        setStatus(r.id, "tossed");
        await speak(["Tossed!"]);
      } else if (mode === "send" || mode === "unknown") {
        await patchLetter(r.id, { needsReview: true, ...(mode === "unknown" ? { status: "unknown_number" } : {}) }).catch(() => {});
        setStatus(r.id, mode === "unknown" ? "unknown_number" : "read", { needsReview: true });
        await speak(["Sent to Ana!"]);
      }
      navigate("/docket");
    } catch {
      await speak(["That didn't go through. It's on your papers; we can try again later."]);
      navigate("/docket");
    } finally { setBusy(false); }
  }

  async function no() {
    stopSpeaking();
    await speak([mode === "ad" ? "I'll keep it." : "All right. It's on your papers if you change your mind."]);
    navigate("/docket");
  }

  if (!r) return null;
  const fc = r.sheet?.freeCare;
  return (
    <main className="screen">
      <div className="row between"><span className="label">The offer</span><a href="/" className="link" onClick={(e) => { e.preventDefault(); stopSpeaking(); navigate("/"); }}>Stop</a></div>
      {mode === "offer" && fc && (
        <section className="card">
          <span className="label">The hospital's own rule</span>
          <p className="lead small">{r.sheet.hospital} gives free care to households at or below {fc.maxFpl}% of the federal poverty level.</p>
          <p className="quote"><span className="mark">“{fc.quote}”</span></p>
          <span className="label plain">Waive sheet · checked {fc.checkedOn || r.sheet.checkedOn} · {fc.sourceUrl ? "quote matched to the hospital's page" : "quote on file"}</span>
        </section>
      )}
      <div className="row"><Dog size={56} /><div><span className="label">Biscuit says</span>{lines.map((l, i) => <p key={i} className="lead small">{l}</p>)}</div></div>
      <div className="spacer" />
      {(mode === "offer" || mode === "ad" || mode === "send" || mode === "unknown") && (
        <button type="button" className="btn big" disabled={busy} onClick={yes}>{mode === "offer" ? "Yes, start it with Ana" : mode === "ad" ? "Toss it" : "Send it to Ana"}</button>
      )}
      <button type="button" className="btn secondary" onClick={mode === "keep" ? () => navigate("/docket") : no}>{mode === "keep" ? "Done" : mode === "ad" ? "Keep it" : "Not now"}</button>
      <p className="foot">Biscuit sends nothing to the hospital. Ana approves everything before it goes anywhere.</p>
    </main>
  );
}
