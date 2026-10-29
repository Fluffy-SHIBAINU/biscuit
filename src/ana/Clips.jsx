import React, { useEffect, useState } from "react";
import { api } from "../lib/api.js";
import { TAPS, TAP_WORDS, tuningLine } from "../lib/clips.js";

const when = (iso) => (iso ? new Date(iso).toLocaleString([], { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }) : "");
const best = (scores) => Object.entries(scores || {}).sort((a, b) => b[1] - a[1])[0];

/** Ana's two choices, in the Mailbox phone card: keep clips for her to check, and let her tapped clips into the export. Each with what it means, in full. */
export function ClipConsent({ household: h, camera, onSaved }) {
  const [note, setNote] = useState("");
  const choose = async (patch, confirmText) => {
    if (confirmText && !window.confirm(confirmText)) return;
    try {
      const r = await api("/family/clips", { method: "PATCH", json: patch });
      setNote(patch.keep === false ? (r.deleted ? `Stopped. ${r.deleted} ${r.deleted === 1 ? "clip" : "clips"} removed.` : "Stopped.") : patch.keep ? "Clips are kept from the next movement. The mailbox phone says so on its screen." : patch.share ? "Thank you. Clips you tap may go into the de-identified set from now on." : "Your tapped clips stay out of the set from now on.");
      if (onSaved) onSaved();
    } catch { setNote("That didn't work. Try again."); }
  };
  const kept = camera?.clips?.total ?? 0;
  return (
    <div className="stack tight">
      <label className="row toggle"><input type="checkbox" checked={Boolean(h.keepClips)} onChange={(e) => choose({ keep: e.target.checked }, e.target.checked ? null : `Stop keeping clips?${kept ? ` The ${kept} ${kept === 1 ? "clip" : "clips"} kept so far ${h.shareClips ? "go too, except the ones you tapped, which stay for the set until you turn that off" : "go too"}.` : ""}`)} /><span className="lead small">Keep short clips of the box for me to check</span></label>
      <span className="label plain">When something moves, the mailbox phone keeps 8 small frames of the box region over 6 seconds, nothing outside the box, so you can tap who it was. Clips you haven't checked go after 7 days; the ones you tap, 30 days after the tap. Only you see them, here. Your taps tune this one mailbox: how sure SAM 3.1 must be, how much movement counts. Off is the default.</span>
      {h.keepClips && (
        <>
          <label className="row toggle"><input type="checkbox" checked={Boolean(h.shareClips)} onChange={(e) => choose({ share: e.target.checked })} /><span className="lead small">Help improve Biscuit for everyone</span></label>
          <span className="label plain">Clips you tapped may be exported to teach a small classifier or a SAM prompt set to tell the carrier from everything else: the box region only, your household as a hashed id, no name, no address, no device, the hour not the minute. Those clips then stay past 30 days, until you turn this off; what was exported before that stays in the set, with nothing that names you.</span>
        </>
      )}
      {note && <span className="label plain signal">{note}</span>}
    </div>
  );
}

/** "Who was at the box": recent clips as filmstrips, three taps and Skip on each, and the one line of what the taps changed. */
export function ClipStrip({ household: h, camera, onLabelled }) {
  const [clips, setClips] = useState(null);
  const [busy, setBusy] = useState(null);
  const pending = camera?.clips?.pending ?? 0;
  const load = () => api("/family/clips").then(setClips).catch(() => setClips([]));
  useEffect(() => { load(); }, [pending]);
  const label = async (id, value) => {
    setBusy(id);
    setClips((cs) => (cs || []).map((c) => (c.id === id ? { ...c, label: value } : c)));
    try {
      const r = await api(`/family/clip/${id}`, { method: "PATCH", json: { label: value } });
      if (value === "skip") setClips((cs) => (cs || []).filter((c) => c.id !== id));
      if (onLabelled) onLabelled(r.tuning);
    } catch { load(); }
    setBusy(null);
  };
  const line = tuningLine(camera?.tuning);
  return (
    <section className="card grow">
      <h2 className="h2">Who was at the box</h2>
      <p className="lead small muted">{line || `Tap who it was. From 8 taps, Biscuit tunes this one mailbox: how sure SAM 3.1 must be before it says mail came, and how much movement the phone needs before it looks.`}</p>
      {clips === null && <p className="lead small muted">One moment.</p>}
      {clips && clips.length === 0 && <p className="lead small muted">{h.keepClips ? "No clips yet. The next movement at the box shows here." : "Nothing kept."}</p>}
      {(clips || []).map((c) => {
        const top = best(c.scores);
        return (
          <div key={c.id} className="clip fact">
            <div className="row between wrap"><span className="label plain">{when(c.at)} · {c.seen ? `SAM saw “${c.seen}”` : top && top[1] > 0 ? `SAM's best guess “${top[0]}” at ${top[1].toFixed(2)}, under the floor` : "SAM saw nothing it knows"}{c.test ? " · test run" : ""}</span>{c.label && <span className="pill signal">{TAP_WORDS[c.label] || c.label}</span>}</div>
            <div className="film">{c.frames.map((f, i) => <img key={i} src={f} alt="" loading="lazy" />)}</div>
            <div className="row wrap">
              {TAPS.map((t) => <button key={t.label} type="button" className={`btn ana small ${c.label === t.label || (t.label === "carrier" && c.label === "mail") ? "primary" : ""}`} disabled={busy === c.id} onClick={() => label(c.id, t.label)}>{t.words}</button>)}
              <button type="button" className="btn ana small" disabled={busy === c.id} onClick={() => label(c.id, "skip")}>Skip</button>
            </div>
          </div>
        );
      })}
      <span className="label plain">Not mail: wind, a car, someone passing. Someone else: a person at the box who is not the carrier. The frames are the box region only; nothing here leaves this page except what you chose above.</span>
    </section>
  );
}
