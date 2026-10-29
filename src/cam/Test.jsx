import React, { useEffect, useRef, useState } from "react";
import { sendFrames, setTest } from "../lib/camapi.js";
import { openCamera, stopCamera } from "../lib/camera.js";
import { navigate } from "../lib/navigate.js";
import { speak } from "../lib/speech.js";
import { store, useStore } from "../lib/store.js";
import { frameFields, startWatcher } from "./watch.js";
import { MotionDetector } from "./motion.js";
import { regionStyle, videoSizeOf } from "./box.js";

const WINDOW_MS = 60_000;

export default function Test() {
  const s = useStore();
  const video = useRef(null);
  const stream = useRef(null);
  const [phase, setPhase] = useState("waiting");
  const [log, setLog] = useState([]);
  const [tries, setTries] = useState(0);
  const [left, setLeft] = useState(60);
  const cleanup = useRef(() => {});
  const region = s.cam?.region;

  function run() {
    setPhase("waiting"); setLog([]); setLeft(60);
    const started = Date.now();
    const clock = () => new Date().toLocaleTimeString([], { hour: "numeric", minute: "2-digit", second: "2-digit" });
    let tick = null;
    const detector = new MotionDetector({ cooldownMs: 5000 });
    const stop = startWatcher(video.current, region, {
      detector,
      onFrames: async (frames) => {
        setLog((l) => [...l, `${clock()} Motion at the box · ${frames.length} frames sent`]);
        try {
          const r = await sendFrames(frames.concat([]), true, frameFields(Boolean(store.get().cam?.collect), detector));
          if (r.seen) { setLog((l) => [...l, `${clock()} “${r.seen}” seen`]); clearInterval(tick); finish("works", stop); }
        } catch { /* keep watching */ }
      },
    });
    tick = setInterval(() => {
      const ms = WINDOW_MS - (Date.now() - started);
      setLeft(Math.max(0, Math.ceil(ms / 1000)));
      if (ms <= 0) { clearInterval(tick); stop(); setPhase("missed"); setTries((t) => t + 1); }
    }, 500);
    cleanup.current = () => { clearInterval(tick); stop(); };
    return cleanup.current;
  }

  async function finish(result, stop) {
    stop?.();
    await setTest(result).catch(() => {});
    store.set((st) => ({ cam: { ...(st.cam || {}), testStatus: result } }));
    setPhase(result === "works" ? "works" : "pending");
    if (result === "works") speak(["Works. Rosa's phone will chime when the mail comes."]);
  }

  useEffect(() => {
    if (!region) { navigate("/cam/setup"); return; }
    (async () => { try { stream.current = await openCamera(video.current); run(); } catch { navigate("/cam/setup"); } })();
    return () => { cleanup.current(); stopCamera(stream.current); };
  }, []);

  return (
    <main className="screen">
      <div className="row between"><span className="label">Camera · 4 of 4 · {phase === "works" ? "works" : phase === "missed" ? "not seen" : "test"}</span><span className="label plain">Spare phone</span></div>
      <h1 className="display small">{phase === "waiting" ? "Open the mailbox, then close it." : phase === "works" ? "Works." : phase === "pending" ? "Set anyway. Test pending." : "I didn't see the lid move."}</h1>
      <div className="frame"><video ref={video} autoPlay playsInline muted />{region && <div className="region" style={regionStyle(region, videoSizeOf(video.current))} />}</div>
      <section className="card">
        <span className="label">{phase === "waiting" ? `Watching the box · ${left} s` : phase === "missed" ? "60 seconds · no change" : "What happened"}</span>
        {log.length ? log.map((l, i) => <p key={i} className="said">{l}</p>) : <p className="lead small muted">{phase === "missed" ? "Motion didn't reach the box region, or glare hid the lid. Move the phone closer to the glass, tilt it down to lose the glare." : "Waiting for the lid."}</p>}
      </section>
      <div className="spacer" />
      {phase === "missed" && tries < 2 && <button type="button" className="btn" onClick={() => { cleanup.current(); run(); }}>Try again <span className="hint">try {tries + 1} of 2</span></button>}
      {phase === "missed" && <button type="button" className="btn secondary" onClick={() => finish("pending")}>Set it anyway</button>}
      {(phase === "works" || phase === "pending") && <button type="button" className="btn" onClick={() => navigate("/cam")}>Done. Watch the box</button>}
      <p className="foot mono">Frames of the box region checked by SAM 3.1 for “mailbox door”, then discarded. Set anyway: Ana's page shows “test pending” until the first real delivery.</p>
    </main>
  );
}
