import React, { useCallback, useEffect, useRef, useState } from "react";
import { api } from "../lib/api.js";
import { guessLine, labelWords, learningLine, pct, TAPS, tuningLine } from "../lib/clips.js";

const when = (iso) => (iso ? new Date(iso).toLocaleString([], { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }) : "");
const best = (scores) => Object.entries(scores || {}).sort((a, b) => b[1] - a[1])[0];
/** The loop plays at about two frames a second. */
export const FRAME_MS = 500;
const SWIPE_PX = 40;

/** Ana's two choices, in the Mailbox phone card: keep clips for her to check, and let her tapped clips into the export. Each with what it means, in full. */
export function ClipConsent({ household: h, camera, onSaved }) {
  const [note, setNote] = useState("");
  const choose = async (patch, confirmText) => {
    if (confirmText && !window.confirm(confirmText)) return;
    try {
      const r = await api("/family/clips", { method: "PATCH", json: patch });
      setNote(patch.keep === false ? (r.deleted ? `Stopped. ${r.deleted} ${r.deleted === 1 ? "clip" : "clips"} removed.` : "Stopped.") : patch.keep ? "Clips are kept from the next movement. The mailbox phone says so on its screen." : patch.share ? "Thank you. Clips you tap, and the ones Biscuit classified that you left as they were, may go into the de-identified set from now on." : "Your clips stay out of the set from now on.");
      if (onSaved) onSaved();
    } catch { setNote("That didn't work. Try again."); }
  };
  const kept = camera?.clips?.total ?? 0;
  return (
    <div className="stack tight">
      <label className="row toggle"><input type="checkbox" checked={Boolean(h.keepClips)} onChange={(e) => choose({ keep: e.target.checked }, e.target.checked ? null : `Stop keeping clips?${kept ? ` The ${kept} ${kept === 1 ? "clip" : "clips"} kept so far ${h.shareClips ? "go too, except the classified ones, which stay for the set until you turn that off" : "go too"}.` : ""}`)} /><span className="lead small">Keep short clips of the box for me to check</span></label>
      <span className="label plain">When something moves, the mailbox phone keeps 8 small frames of the box region over 6 seconds, nothing outside the box, so you can tap who it was. Biscuit says what it thinks each clip is and how sure it is; your tap confirms or corrects it. Clips you haven't checked go after 7 days; the ones you tap, 30 days after the tap. Only you see them, here. Your taps tune this one mailbox: how sure SAM 3.1 must be, how much movement counts, what a person at the box usually means here; once it has been right nine times in ten over twenty of your taps, Biscuit classifies the sure clips itself and you can say Not right. Off is the default.</span>
      {h.keepClips && (
        <>
          <label className="row toggle"><input type="checkbox" checked={Boolean(h.shareClips)} onChange={(e) => choose({ share: e.target.checked })} /><span className="lead small">Help improve Biscuit for everyone</span></label>
          <span className="label plain">Clips you tapped, and clips Biscuit classified that you left as they were, may be exported to teach a small classifier or a SAM prompt set to tell the carrier from everything else: the box region only, your household as a hashed id, no name, no address, no device, the hour not the minute, and whether the label was yours or Biscuit's. Those clips then stay past 30 days, until you turn this off; what was exported before that stays in the set, with nothing that names you.</span>
        </>
      )}
      {note && <span className="label plain signal">{note}</span>}
    </div>
  );
}

/** What a card says under the picture. */
export function describeClip(c, group) {
  const g = c.guess;
  if (group === "attention") {
    if (g?.rejected) return `You said: not right to “${labelWords(g.label)}”. What was it?`;
    const line = guessLine(g);
    if (line) return line;
    const top = best(c.scores);
    return c.seen ? `SAM saw “${c.seen}”` : top && top[1] > 0 ? `SAM's best guess “${top[0]}” at ${top[1].toFixed(2)}, under the floor` : "SAM saw nothing it knows";
  }
  if (c.labelledBy === "biscuit") return `${labelWords(c.label)} · by Biscuit${g ? ` (${pct(g.confidence)})` : ""}`;
  return `${labelWords(c.label)} · by you${g ? ` · Biscuit thought ${labelWords(g.label)} (${pct(g.confidence)})${c.agreed === false ? ", corrected" : ""}` : ""}`;
}

/**
 * "Who was at the box": a carousel, one clip at a time, the eight frames as a loop (tap pauses), a scrubber, arrows and
 * swipes between clips, a counter, and two groups: the clips that need Ana and the ones already classified, by her or
 * by Biscuit. Biscuit's guess is the dark button, so one tap confirms; the other taps correct. On a clip Biscuit
 * classified itself, Not right hands it back.
 */
export function ClipCarousel({ household: h, camera, onLabelled }) {
  const [data, setData] = useState(null);
  const [group, setGroup] = useState("attention");
  const [index, setIndex] = useState(0);
  const [frames, setFrames] = useState(null);
  const [frame, setFrame] = useState(0);
  const [playing, setPlaying] = useState(true);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState("");
  const cache = useRef(new Map());
  const touch = useRef(null);
  const pendingCount = camera?.clips?.attention ?? 0, doneCount = camera?.clips?.classified ?? 0;
  const load = useCallback(() => api("/family/clips").then((d) => { setData(d); return d; }).catch(() => { const empty = { attention: [], classified: [], counts: { attention: 0, classified: 0 } }; setData(empty); return empty; }), []);
  useEffect(() => { load(); }, [load, pendingCount, doneCount]);
  const list = data ? data[group] || [] : [];
  const at = Math.min(index, Math.max(0, list.length - 1));
  const clip = list[at] || null;
  const clipId = clip?.id ?? null;

  // The frames of the clip on stage, fetched once and kept for the session.
  useEffect(() => {
    setFrame(0); setPlaying(true);
    if (clipId === null) { setFrames(null); return undefined; }
    const cached = cache.current.get(clipId);
    if (cached) { setFrames(cached); return undefined; }
    setFrames(null);
    let live = true;
    api(`/family/clip/${clipId}`).then((full) => { cache.current.set(clipId, full.frames); if (live) setFrames(full.frames); }).catch(() => { if (live) setFrames(clip?.poster ? [clip.poster] : []); });
    return () => { live = false; };
  }, [clipId]);
  useEffect(() => {
    if (!playing || !frames || frames.length < 2) return undefined;
    const t = setInterval(() => setFrame((f) => (f + 1) % frames.length), FRAME_MS);
    return () => clearInterval(t);
  }, [playing, frames]);

  const go = (d) => setIndex(() => Math.max(0, Math.min(list.length - 1, at + d)));
  const pick = (g) => { setGroup(g); setIndex(0); };
  const onKey = (e) => {
    if (e.key === "ArrowLeft") go(-1);
    else if (e.key === "ArrowRight") go(1);
    else if (e.key === " " && e.target === e.currentTarget) { e.preventDefault(); setPlaying((p) => !p); }
  };
  const onTouchStart = (e) => { touch.current = e.touches[0].clientX; };
  const onTouchEnd = (e) => { if (touch.current == null) return; const dx = e.changedTouches[0].clientX - touch.current; touch.current = null; if (Math.abs(dx) > SWIPE_PX) go(dx < 0 ? 1 : -1); };
  const act = async (body, after) => {
    if (!clip || busy) return;
    setBusy(true); setNote("");
    try {
      const r = await api(`/family/clip/${clip.id}`, { method: "PATCH", json: body });
      const d = await load();
      if (after) after(d, r);
      if (onLabelled) onLabelled(r.tuning);
    } catch { setNote("That didn't work. Try again."); }
    setBusy(false);
  };
  const tap = (label) => act({ label }, (d) => { if (group === "attention") setIndex((i) => Math.max(0, Math.min(i, (d.attention || []).length - 1))); });
  const reject = () => act({ reject: true }, (d) => { const i = (d.attention || []).findIndex((c) => c.id === clip.id); setGroup("attention"); setIndex(Math.max(0, i)); });

  const line = tuningLine(camera?.tuning), learned = learningLine(camera?.tuning);
  const counts = data?.counts ?? { attention: pendingCount, classified: doneCount };
  const shown = frames && frames.length ? frames[Math.min(frame, frames.length - 1)] : clip?.poster || null;
  const byBiscuit = clip?.labelledBy === "biscuit";
  const primary = group === "attention" ? clip?.guess?.label ?? null : clip?.label === "mail" ? "carrier" : clip?.label ?? null;

  return (
    <section className="card grow carousel" tabIndex={0} onKeyDown={onKey} aria-label="Who was at the box">
      <div className="row between wrap"><h2 className="h2">Who was at the box</h2>{clip && <span className="label plain">{at + 1} of {list.length}</span>}</div>
      <div className="tabs">
        <button type="button" className={`btn ana small ${group === "attention" ? "on" : ""}`} onClick={() => pick("attention")}>Needs your attention · {counts.attention}</button>
        <button type="button" className={`btn ana small ${group === "classified" ? "on" : ""}`} onClick={() => pick("classified")}>Already classified · {counts.classified}</button>
      </div>
      <p className="lead small muted">{line || "Tap who it was. Biscuit's guess is the dark button: one tap confirms it, another corrects it. From 8 taps Biscuit tunes this one mailbox."}</p>
      {learned && <p className="lead small muted">{learned}</p>}
      {note && <p className="lead small signal">{note}</p>}
      {data === null && <p className="lead small muted">One moment.</p>}
      {data && !clip && <p className="lead small muted">{group === "attention" ? (h.keepClips ? "Nothing needs you. The next movement at the box shows here." : "Nothing waiting.") : "Nothing classified yet."}</p>}
      {clip && (
        <div className="clip stack tight">
          <div className="stage" onClick={() => setPlaying((p) => !p)} onTouchStart={onTouchStart} onTouchEnd={onTouchEnd} role="button" aria-label={playing ? "Pause the clip" : "Play the clip"}>
            {shown ? <img src={shown} alt="" /> : <span className="label night">One moment.</span>}
            {!playing && <span className="pill signal paused">Paused</span>}
            <button type="button" className="navbtn prev" disabled={at === 0} onClick={(e) => { e.stopPropagation(); go(-1); }} aria-label="Previous clip">‹</button>
            <button type="button" className="navbtn next" disabled={at >= list.length - 1} onClick={(e) => { e.stopPropagation(); go(1); }} aria-label="Next clip">›</button>
          </div>
          <div className="scrub" aria-hidden="true">{(frames || [null]).map((_, i) => <span key={i} className={i <= frame ? "on" : ""} />)}</div>
          <span className="label plain">{when(clip.at)} · {describeClip(clip, group)}{clip.test ? " · test run" : ""}</span>
          <div className="row wrap">
            {group === "classified" && byBiscuit ? (
              <>
                <button type="button" className="btn ana small primary" disabled={busy} onClick={reject}>Not right</button>
                <button type="button" className="btn ana small" disabled={busy} onClick={() => tap(clip.label)}>Yes, right</button>
              </>
            ) : (
              <>
                {TAPS.map((t) => <button key={t.label} type="button" className={`btn ana small ${primary === t.label ? "primary" : ""}`} disabled={busy} onClick={() => tap(t.label)}>{t.words}</button>)}
                {group === "attention" && <button type="button" className="btn ana small" disabled={busy} onClick={() => tap("skip")}>Skip</button>}
              </>
            )}
          </div>
        </div>
      )}
      <span className="label plain">Not mail: wind, a car, someone passing. Someone else: a person at the box who is not the carrier. Swipe or use the arrows to move between clips; tap the picture to pause. The frames are the box region only; nothing here leaves this page except what you chose above.</span>
    </section>
  );
}
