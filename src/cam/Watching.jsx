import React, { useEffect, useRef, useState } from "react";
import { heartbeat, sendFrames } from "../lib/camapi.js";
import { openCamera, stopCamera } from "../lib/camera.js";
import { navigate } from "../lib/navigate.js";
import { speak } from "../lib/speech.js";
import { store, useStore } from "../lib/store.js";
import { MotionDetector } from "./motion.js";
import { frameFields, shouldSend, startWatcher } from "./watch.js";

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
  const [battery, setBattery] = useState(null);
  const [charging, setCharging] = useState(null);
  const [events, setEvents] = useState([]);
  const [sentToday, setSentToday] = useState(0);
  const [paused, setPaused] = useState(false);
  const warned = useRef({});
  const gate = useRef({ paused: false, battery: null, charging: null });
  const region = s.cam?.region;
  const collect = Boolean(s.cam?.collect);
  const [kept, setKept] = useState(0);
  const setGate = (patch) => { gate.current = { ...gate.current, ...patch }; setPaused(!shouldSend(gate.current)); };

  useEffect(() => {
    if (!region) { navigate("/cam/setup"); return; }
    const wanted = collectFromUrl(window.location.search, s.cam?.collect);
    if (wanted !== Boolean(s.cam?.collect)) store.set((st) => ({ cam: { ...(st.cam || {}), collect: wanted } }));
    let stopWatch = () => {};
    let hb = null;
    let bat = null;
    (async () => {
      try { stream.current = await openCamera(video.current); } catch { navigate("/cam/setup"); return; }
      try { await navigator.wakeLock?.request("screen"); } catch { /* optional */ }
      try { bat = await navigator.getBattery?.(); } catch { bat = null; }
      const beat = async () => {
        const level = bat ? Math.round(bat.level * 100) : null;
        const chg = bat ? bat.charging : null;
        setBattery(level); setCharging(chg); setGate({ battery: level, charging: chg });
        if (level !== null && !chg) {
          if (level <= 20 && !warned.current[20]) { warned.current[20] = true; speak(["Plug me in."]); }
          if (level <= 12 && !warned.current[12]) { warned.current[12] = true; speak(["Plug me in. I'm almost out."]); }
        }
        try { const r = await heartbeat(level, chg); setGate({ paused: Boolean(r.paused) }); } catch { /* keep the last known gate */ }
      };
      await beat();
      hb = setInterval(beat, 60_000);
      setStatus("watching");
      const detector = new MotionDetector();
      stopWatch = startWatcher(video.current, region, {
        detector,
        isPaused: () => !shouldSend(gate.current),
        onFrames: async (frames) => {
          if (!shouldSend(gate.current)) return;
          try {
            const r = await sendFrames(frames, false, frameFields(Boolean(store.get().cam?.collect), detector));
            setSentToday(r.callsToday ?? 0);
            if (r.kept) setKept((k) => k + 1);
            setEvents((e) => [{ at: clock(), text: r.seen ? `“${r.seen}” · mail seen · Rosa's phone told` : "movement · nothing recognised" }, ...e].slice(0, 6));
          } catch (err) {
            if (err?.status === 429 || err?.status === 409) setGate({ paused: true });
          }
        },
      });
    })();
    return () => { if (hb) clearInterval(hb); stopWatch(); stopCamera(stream.current); };
  }, []);

  return (
    <main className="screen night dim">
      <div className="row between"><span className="label night">Biscuit · mailbox phone</span><span className={`pill ${paused ? "warn" : "ok"}`}>{paused ? "Paused" : status === "watching" ? "Watching" : "Starting"}</span></div>
      <h1 className="display small">Watching Rosa's mailbox.</h1>
      <div className="frame"><video ref={video} autoPlay playsInline muted />{region && <div className="region" style={{ left: `${region.x * 100}%`, top: `${region.y * 100}%`, width: `${region.w * 100}%`, height: `${region.h * 100}%` }} />}</div>
      <section className="card night">
        <div className="row between"><span>Plugged in</span><span className="label plain">{battery === null ? "unknown" : `${charging ? "yes" : "no"} · ${battery}%`}</span></div>
        <div className="row between"><span>Frames sent today</span><span className="label plain">{sentToday} · {collect ? `${kept} kept for calibration` : "all discarded"}</span></div>
        {events.map((e, i) => <div key={i} className="row between"><span>{e.text}</span><span className="label plain">{e.at}</span></div>)}
      </section>
      {collect && <section className="card night"><span className="pill warn">Collecting</span><p className="lead small">Calibration mode, this phone only: each movement's frames and SAM's scores are kept for Ana's household to label. Open this page with ?collect=0 to stop.</p></section>}
      <p className="lead small">{paused && battery !== null && battery < 10 ? "Plug me in. Watching pauses under 10%." : paused ? "Paused from Ana's page, or today's limit reached." : collect ? "Something moves at the box: 3 frames go to SAM 3.1 and are kept with their scores." : "Nothing moves, nothing is sent. Something moves at the box: 3 frames go to SAM 3.1, then they're gone."}</p>
      <div className="spacer" />
      <button type="button" className="btn secondary night" onClick={() => navigate("/cam/setup")}>Find the mailbox again</button>
      <p className="foot mono">Keep this page open and plugged in. Closing it stops the camera; Rosa's phone still works, she can tap Mail came.</p>
    </main>
  );
}
