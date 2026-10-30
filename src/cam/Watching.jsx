import React, { useEffect, useRef, useState } from "react";
import { heartbeat, sendClip, sendFrames } from "../lib/camapi.js";
import { openCamera, stopCamera } from "../lib/camera.js";
import { navigate } from "../lib/navigate.js";
import { speak } from "../lib/speech.js";
import { store, useStore } from "../lib/store.js";
import { MotionDetector } from "./motion.js";
import { applyGate, frameFields, shouldSend, startWatcher } from "./watch.js";
import { labelWords, pct } from "../lib/clips.js";
import { regionStyle, videoSizeOf } from "./box.js";

const clock = () => new Date().toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });

/** ?collect=1 turns collect mode on for this phone and ?collect=0 turns it off; the choice is kept with the camera settings. */
export function collectFromUrl(search, current) {
  const v = new URLSearchParams(search || "").get("collect");
  return v === "1" ? true : v === "0" ? false : Boolean(current);
}

export default function Watching() {
  const s = useStore();
  const video = useRef(null);
  const stream = useRef(null);
  const [status, setStatus] = useState("starting");
  // What the motion gate sees right now, so the phone can say why it is or is not sending.
  const [motion, setMotion] = useState(null);
  // The camera stream froze (the page lives, the frames do not): the screen says so and a tap restarts it.
  const [asleep, setAsleep] = useState(false);
  const restartRef = useRef(() => {});
  const [battery, setBattery] = useState(null);
  const [charging, setCharging] = useState(null);
  const [events, setEvents] = useState([]);
  const [sentToday, setSentToday] = useState(0);
  const [paused, setPaused] = useState(false);
  const [kept, setKept] = useState(0);
  // Clips: Ana's choice, learned from the server on every heartbeat; the phone says on screen when clips are kept.
  const [clips, setClips] = useState(false);
  const [clipsKept, setClipsKept] = useState(0);
  const clipsRef = useRef(false);
  const warned = useRef({});
  const gate = useRef({ paused: false, battery: null, charging: null });
  const region = s.cam?.region;
  const collect = Boolean(s.cam?.collect);
  const setGate = (patch) => { gate.current = { ...gate.current, ...patch }; setPaused(!shouldSend(gate.current)); };

  useEffect(() => {
    if (!region) { navigate("/cam/setup"); return; }
    const wanted = collectFromUrl(window.location.search, s.cam?.collect);
    if (wanted !== Boolean(s.cam?.collect)) store.set((st) => ({ cam: { ...(st.cam || {}), collect: wanted } }));
    let stopWatch = () => {};
    let hb = null;
    let bat = null;
    let gone = false;
    let onVisible = null;
    (async () => {
      try { stream.current = await openCamera(video.current); } catch { navigate("/cam/setup"); return; }
      try { await navigator.wakeLock?.request("screen"); } catch { /* optional */ }
      try { bat = await navigator.getBattery?.(); } catch { bat = null; }
      const detector = new MotionDetector();
      // A frozen stream: the track ended or muted (the screen went dark, another app took the camera), or thirty seconds of
      // identical frames. The heartbeat tells the server, the screen says so, and the camera is opened again.
      const trackDead = () => { const t = stream.current?.getVideoTracks?.()[0]; return !t || t.readyState === "ended" || t.muted === true; };
      const health = () => trackDead() || detector.frozen();
      const wake = async () => { try { await navigator.wakeLock?.request("screen"); } catch { /* optional */ } };
      let restarting = false;
      const arm = () => { const t = stream.current?.getVideoTracks?.()[0]; if (t) t.onmute = t.onended = () => setTimeout(() => { if (!gone && health()) restart(); }, 2000); };
      const restart = async () => {
        if (restarting || gone) return;
        restarting = true;
        try { stopCamera(stream.current); stream.current = await openCamera(video.current); detector.prev = null; detector.zeroStreak = 0; arm(); setAsleep(false); await wake(); }
        catch { /* still asleep; the next heartbeat or a tap tries again */ }
        finally { restarting = false; }
      };
      restartRef.current = restart;
      arm();
      onVisible = () => { if (document.visibilityState === "visible" && !gone) { wake(); if (health()) restart(); } };
      document.addEventListener("visibilitychange", onVisible);
      const beat = async () => {
        const level = bat ? Math.round(bat.level * 100) : null;
        const chg = bat ? bat.charging : null;
        setBattery(level); setCharging(chg); setGate({ battery: level, charging: chg });
        if (level !== null && !chg) {
          if (level <= 20 && !warned.current[20]) { warned.current[20] = true; speak(["Plug me in."]); }
          if (level <= 12 && !warned.current[12]) { warned.current[12] = true; speak(["Plug me in. I'm almost out."]); }
        }
        try {
          const dead = health();
          setAsleep(dead);
          const r = await heartbeat(level, chg, dead ? "frozen" : "live");
          if (dead) restart();
          setGate({ paused: Boolean(r.paused) });
          clipsRef.current = Boolean(r.clips); setClips(clipsRef.current);
          applyGate(detector, r.gate);
        } catch { /* keep the last known gate */ }
      };
      await beat();
      if (gone) return;
      hb = setInterval(beat, 60_000);
      setStatus("watching");
      // The clip follows the frames it belongs to: the frames reply names the row, the small frames fill it.
      let pending = Promise.resolve(null);
      stopWatch = startWatcher(video.current, region, {
        detector,
        isPaused: () => !shouldSend(gate.current),
        onLevel: (state, diff, threshold) => setMotion({ state, diff, threshold }),
        clip: () => clipsRef.current && shouldSend(gate.current),
        onFrames: async (frames) => {
          if (!shouldSend(gate.current)) { pending = Promise.resolve(null); return; }
          pending = sendFrames(frames, false, frameFields(Boolean(store.get().cam?.collect), detector));
          try {
            const r = await pending;
            setSentToday(r.callsToday ?? 0);
            applyGate(detector, r.gate);
            if (r.kept) setKept((k) => k + 1);
            // What the send found, and, when clips are kept, what Biscuit thinks the clip shows.
            const thinks = r.guess ? ` · Biscuit thinks ${labelWords(r.guess.label)} ${pct(r.guess.confidence)}` : "";
            setEvents((e) => [{ at: clock(), text: `${r.seen ? `“${r.seen}” · mail seen · Rosa's phone told` : "movement · nothing recognised"}${thinks}` }, ...e].slice(0, 6));
            return r;
          } catch (err) {
            if (err?.status === 429 || err?.status === 409) setGate({ paused: true });
          }
        },
        onClip: async (frames) => {
          const r = await pending.catch(() => null);
          if (!r?.clipId) return;
          try { await sendClip(r.clipId, frames); setClipsKept((n) => n + 1); } catch { /* this one clip is not kept */ }
        },
      });
    })();
    return () => { gone = true; if (onVisible) document.removeEventListener("visibilitychange", onVisible); if (hb) clearInterval(hb); stopWatch(); stopCamera(stream.current); };
  }, []);

  return (
    <main className="screen night dim" onClick={asleep ? () => restartRef.current() : undefined}>
      <div className="row between"><span className="label night">Biscuit · Mailbox Phone</span><span className={`pill ${paused ? "warn" : "ok"}`}>{asleep ? "Asleep" : paused ? "Paused" : status === "watching" ? "Watching" : "Starting"}</span></div>
      <h1 className="display small">Watching Rosa's Mailbox.</h1>
      <div className="frame"><video ref={video} autoPlay playsInline muted />{region && <div className="region" style={regionStyle(region, videoSizeOf(video.current))} />}</div>
      <p className="lead small">{asleep ? "Camera Asleep · Tap Here" : paused && battery !== null && battery < 10 ? "Paused · Plug Me In" : paused ? "Paused" : `${events.length ? `Last Movement ${events[0].at}` : "Nothing Has Moved Yet"} · ${clips ? "Keeping Short Clips for Ana" : collect ? "Collecting Frames" : "Frames Checked and Gone"}`}</p>
      <p className="lead small muted">Keep This Page Open and Plugged In</p>
      {collect && <>
        <section className="card night">
          <div className="row between"><span>Plugged in</span><span className="label plain">{battery === null ? "unknown" : `${charging ? "yes" : "no"} · ${battery}%`}</span></div>
          <div className="row between"><span>Frames sent today</span><span className="label plain">{sentToday} · {collect ? `${kept} kept for calibration` : clips ? `${clipsKept} ${clipsKept === 1 ? "clip" : "clips"} kept for Ana` : "all discarded"}</span></div>
          <div className="row between"><span>Movement now</span><span className="label plain">{motion ? `${motion.diff.toFixed(1)} of ${motion.threshold}${motion.state === "motion" ? " · sending" : motion.state === "cooldown" ? " · cooling down" : ""}` : "…"}</span></div>
          {events.map((e, i) => <div key={i} className="row between"><span>{e.text}</span><span className="label plain">{e.at}</span></div>)}
        </section>
        {clips && <section className="card night"><span className="pill signal">Clips</span><p className="lead small">Keeping short clips of the box for Ana to check: when something moves, 8 small frames of the box region over 6 seconds go to her page. Ana turned this on; she can turn it off there.</p></section>}
        {collect && <section className="card night"><span className="pill warn">Collecting</span><p className="lead small">Calibration mode, this phone only: each movement's frames and SAM's scores are kept for Ana's household to label. Open this page with ?collect=0 to stop.</p></section>}
        <p className="lead small">{paused && battery !== null && battery < 10 ? "Watching pauses under 10% on battery. " : paused ? "Paused from Ana's page, or today's limit reached. " : ""}{collect ? "Something moves at the box: 3 frames go to SAM 3.1 and are kept with their scores." : clips ? "Something moves at the box: 3 frames go to SAM 3.1, and a 6-second clip of the box is kept for Ana to check." : "Nothing moves, nothing is sent. Something moves at the box: 3 frames go to SAM 3.1, then they're gone. Checks again 5 seconds after a sighting, more slowly after false alarms."}</p>
        <p className="foot mono">Closing this page stops the camera; Rosa's phone still works, she can tap Mail came.</p>
      </>}
      <div className="spacer" />
      <div className="row pair">
        <button type="button" className="btn secondary night" onClick={() => navigate("/cam/setup?draw=1")}>Adjust the Box</button>
      </div>
      <button type="button" className="btn secondary night" onClick={() => navigate("/cam/setup")}>Find the Mailbox Again</button>
    </main>
  );
}
