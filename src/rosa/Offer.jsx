import React, { useEffect, useRef, useState } from "react";
import Dog from "../components/Dog.jsx";
import { handoff, patchLetter } from "../lib/api.js";
import { navigate } from "../lib/navigate.js";
import { keep, speak, stopSpeaking } from "../lib/speech.js";
import { releaseEar } from "../lib/ear.js";
import { askChoices, cancelChoices } from "../lib/hear.js";
import { answerFrom } from "../lib/answers.js";
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
      keep(lines.join(" "));
      const asks = mode === "offer" || mode === "ad" || mode === "send" || mode === "unknown";
      if (!asks) { await speak(lines); return; }
      const key = await askChoices({ lines, alive: () => alive.current, options: [
        { key: "yes", say: "yes", match: (t) => answerFrom(t) === "yes" || /\b(go ahead|toss|send it|start it)\b/i.test(t) },
        { key: "no", say: mode === "ad" ? "keep it" : "not now", match: (t) => answerFrom(t) === "no" || /\b(keep|not now|later)\b/i.test(t) },
      ] });
      if (!alive.current) return;
      if (key === "yes") yes(); else if (key === "no") no();
    })();
    return () => { alive.current = false; stopSpeaking(); cancelChoices(); releaseEar(); };
  }, [r?.id]);

  async function yes() {
    if (busy || !r) return;
    cancelChoices(); setBusy(true); stopSpeaking();
    try {
      if (mode === "offer") {
        const { waiveUrl } = await handoff(r.id, r.hospital.ccn);
        setStatus(r.id, "handoff", { waiveUrl, sentToAna: true, waitingLine: `${r.hospital.name}'s application. Ana has it on her page.` });
        await speak(["Done! Ana has it on her page. I'll tell you when the hospital answers."]);
        navigate(`/docket?sent=${r.id}`); return;
      } else if (mode === "ad") {
        await patchLetter(r.id, { status: "tossed" }).catch(() => {});
        setStatus(r.id, "tossed");
        await speak(["Tossed!"]);
      } else if (mode === "send" || mode === "unknown") {
        await patchLetter(r.id, { needsReview: true, ...(mode === "unknown" ? { status: "unknown_number" } : {}) }).catch(() => {});
        setStatus(r.id, mode === "unknown" ? "unknown_number" : "read", { needsReview: true, sentToAna: true });
        await speak(["Sent to Ana!"]);
        navigate(`/docket?sent=${r.id}`); return;
      }
      navigate("/docket");
    } catch {
      await speak(["That didn't go through. It's on your papers; we can try again later."]);
      navigate("/docket");
    } finally { setBusy(false); }
  }

  async function no() {
    cancelChoices(); stopSpeaking();
    await speak([mode === "ad" ? "I'll keep it." : "All right. It's on your papers if you change your mind."]);
    navigate("/docket");
  }

  if (!r) return null;
  const fc = r.sheet?.freeCare;
  return (
    <main className="screen">
      <div className="row between"><span className="label">The Offer</span><a href="/" className="link" onClick={(e) => { e.preventDefault(); stopSpeaking(); navigate("/"); }}>Stop</a></div>
      {mode === "offer" && fc && (
        <section className="card">
          <span className="label">The Hospital's Own Rule</span>
          <p className="lead small">{r.sheet.hospital} gives free care to families with low income, up to {fc.maxFpl}% of the poverty line.</p>
          <p className="quote"><span className="mark">“{fc.quote}”</span></p>
          <span className="label plain">Checked {fc.checkedOn || r.sheet.checkedOn}</span>
        </section>
      )}
      <div className="row"><Dog size={56} /><div><span className="label">Biscuit Says</span>{lines.map((l, i) => <p key={i} className="lead">{l}</p>)}</div></div>
      <div className="spacer" />
      {(mode === "offer" || mode === "ad" || mode === "send" || mode === "unknown") && (
        <button type="button" className="btn big" disabled={busy} onClick={yes}>{busy ? (mode === "offer" ? "Starting It with Ana…" : mode === "ad" ? "Tossing It…" : "Sending to Ana…") : mode === "offer" ? "Yes, Start It with Ana" : mode === "ad" ? "Toss It" : "Send It to Ana"}</button>
      )}
      <button type="button" className="btn secondary" onClick={mode === "keep" ? () => navigate("/docket") : no}>{mode === "keep" ? "Done" : mode === "ad" ? "Keep It" : "Not Now"}</button>
    </main>
  );
}
