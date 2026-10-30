import React, { useCallback, useEffect, useRef, useState } from "react";
import Details from "../components/Details.jsx";
import { api } from "../lib/api.js";
import { clipDetail, clipLine, clipsSummary, learningLine, TAPS, tuningLine } from "../lib/clips.js";

const when = (iso) => (iso ? new Date(iso).toLocaleString([], { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }) : "");
/** The loop plays at about two frames a second. */
export const FRAME_MS = 500;
const SWIPE_PX = 40;

/** Ana's two choices, in the Mailbox Phone card: a Title Case name and one short sentence each beside the switch, since consent must say what is kept. The long words (ClipConsentDetails) render only in the admin view. */
export function ClipConsent({ household: h, camera, onSaved }) {
  const [note, setNote] = useState("");
  const choose = async (patch, confirmText) => {
    if (confirmText && !window.confirm(confirmText)) return;
    try {
      const r = await api("/family/clips", { method: "PATCH", json: patch });
      setNote(patch.keep === false ? (r.deleted ? `Stopped. ${r.deleted} ${r.deleted === 1 ? "clip" : "clips"} removed.` : "Stopped.") : patch.keep ? "On from the next movement." : patch.share ? "Thank you." : "Off from now on.");
      if (onSaved) onSaved();
    } catch { setNote("That didn't work. Try again."); }
  };
  const kept = camera?.clips?.total ?? 0;
  return (
    <div className="stack tight">
      <label className="row toggle"><input type="checkbox" checked={Boolean(h.keepClips)} onChange={(e) => choose({ keep: e.target.checked }, e.target.checked ? null : `Stop keeping clips?${kept ? ` The ${kept} ${kept === 1 ? "clip" : "clips"} kept so far ${h.shareClips ? "go too, except the ones you tapped, which stay to help Biscuit learn until you turn that off" : "go too"}.` : ""}`)} /><span className="lead small"><strong>Keep Short Clips</strong> · Short clips of the box so you can say who it was; only you see them, gone within 30 days{h.shareClips ? ", except the tapped ones that help Biscuit learn" : ""}.</span></label>
      {h.keepClips && <label className="row toggle"><input type="checkbox" checked={Boolean(h.shareClips)} onChange={(e) => choose({ share: e.target.checked })} /><span className="lead small"><strong>Help Improve Biscuit</strong> · The clips you tapped help Biscuit learn for everyone, with nothing that names you.</span></label>}
      {note && <span className="label plain signal">{note}</span>}
    </div>
  );
}

/** The full words behind the two choices, for the admin view only. */
export function ClipConsentDetails() {
  return (
    <>
      <span className="label plain">Keep Short Clips: when something moves, the mailbox phone keeps 8 small frames of the box region over 6 seconds, nothing outside the box, with SAM 3.1's scores, so you can tap who it was. Biscuit says what it thinks each clip is; your tap confirms or corrects it. Clips you haven't checked go after 7 days; the ones you tap, 30 days after the tap. Only you see them, on this page. Your taps tune this one mailbox: how sure SAM must be, how much movement counts, what a person at the box usually means here; once a prompt has been right nine times in ten over twenty of your taps, Biscuit classifies the sure clips itself and you can say Not Right. Off is the default.</span>
      <span className="label plain">Help Improve Biscuit: clips you tapped, and clips Biscuit classified that you left as they were, may be exported to teach a small classifier or a SAM prompt set to tell the carrier from everything else: the box region only, your household as a hashed id, no name, no address, no device, the hour not the minute, and whether the label was yours or Biscuit's. Those clips then stay past 30 days, until you turn this off; what was exported before that stays in the set, with nothing that names you.</span>
    </>
  );
}

/**
 * "Who Was at the Box": a carousel, one clip at a time, the eight frames as a loop (tap pauses), a scrubber, arrows and
 * swipes between clips, a counter, and two groups: the clips that need Ana and the ones already classified, by her or by
 * Biscuit. Biscuit's guess is the dark button, so one tap confirms; the other taps correct. On a clip Biscuit classified
 * itself, Not Right hands it back. Everything with a number or an explanation in it renders only in the admin view.
 */
export function ClipCarousel({ household: h, camera, onLabelled, admin = false }) {
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

  const counts = data?.counts ?? { attention: pendingCount, classified: doneCount };
  const summary = clipsSummary({ keepClips: Boolean(h.keepClips), movementsToday: camera?.movementsToday ?? 0, attention: counts.attention, classified: counts.classified, tuning: camera?.tuning });
  const shown = frames && frames.length ? frames[Math.min(frame, frames.length - 1)] : clip?.poster || null;
  const byBiscuit = clip?.labelledBy === "biscuit";
  const primary = group === "attention" ? clip?.guess?.label ?? null : clip?.label === "mail" ? "carrier" : clip?.label ?? null;
  const tuned = tuningLine(camera?.tuning), learned = learningLine(camera?.tuning);

  return (
    <section className="card grow carousel" tabIndex={0} onKeyDown={onKey} aria-label="Who Was at the Box">
      <div className="row between wrap"><h2 className="h2">{summary.title}</h2>{clip && <span className="label plain">{at + 1} of {list.length}</span>}</div>
      {summary.lines.map((l, i) => <p key={i} className={`lead small ${i ? "muted" : ""}`}>{l}</p>)}
      <div className="tabs">
        <button type="button" className={`btn ana small ${group === "attention" ? "on" : ""}`} onClick={() => pick("attention")}>Needs Your Attention · {counts.attention}</button>
        <button type="button" className={`btn ana small ${group === "classified" ? "on" : ""}`} onClick={() => pick("classified")}>Already Classified · {counts.classified}</button>
      </div>
      {note && <p className="lead small signal">{note}</p>}
      {data === null && <p className="lead small muted">One Moment</p>}
      {data && !clip && <p className="lead small muted">{group === "attention" ? "Nothing to Check" : "Nothing Sorted Yet"}</p>}
      {clip && (
        <div className="clip stack tight">
          <div className="stage" onClick={() => setPlaying((p) => !p)} onTouchStart={onTouchStart} onTouchEnd={onTouchEnd} role="button" aria-label={playing ? "Pause the clip" : "Play the clip"}>
            {shown ? <img src={shown} alt="" /> : <span className="label night">One Moment</span>}
            {!playing && <span className="pill signal paused">Paused</span>}
            <button type="button" className="navbtn prev" disabled={at === 0} onClick={(e) => { e.stopPropagation(); go(-1); }} aria-label="Previous clip">‹</button>
            <button type="button" className="navbtn next" disabled={at >= list.length - 1} onClick={(e) => { e.stopPropagation(); go(1); }} aria-label="Next clip">›</button>
          </div>
          <div className="scrub" aria-hidden="true">{(frames || [null]).map((_, i) => <span key={i} className={i <= frame ? "on" : ""} />)}</div>
          <p className="lead small">{clipLine(clip, group)}</p>
          <span className="label plain">{when(clip.at)}</span>
          <div className="row wrap">
            {group === "classified" && byBiscuit ? (
              <>
                <button type="button" className="btn ana small primary" disabled={busy} onClick={reject}>Not Right</button>
                <button type="button" className="btn ana small" disabled={busy} onClick={() => tap(clip.label)}>Yes, Right</button>
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
      {admin && <Details open>
        {tuned && <span className="label plain">{tuned}</span>}
        {learned && <span className="label plain">{learned}</span>}
        {clip && <span className="label plain">{clipDetail(clip)}</span>}
        <span className="label plain">{counts.attention} to check · {counts.classified} classified · {camera?.movementsToday ?? 0} {camera?.movementsToday === 1 ? "movement" : "movements"} today · the dark button is Biscuit's guess; stored labels carrier, nothing, other, skip.</span>
        <span className="label plain">A car or the wind: anything that was not mail. Someone else: a person at the box who is not the carrier. Swipe or use the arrows to move between clips; tap the picture to pause. The frames are the box region only, 320 pixels wide, up to 8 over 6 seconds; unchecked clips go after 7 days, tapped ones 30 days after the tap unless they help Biscuit learn. Nothing here leaves this page except what you chose in the Mailbox Phone card.</span>
      </Details>}
    </section>
  );
}
