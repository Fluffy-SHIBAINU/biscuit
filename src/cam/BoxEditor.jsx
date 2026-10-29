import React, { useRef, useState } from "react";
import { boxFrom, dragBox, finishDraw, FRAME, frameToVideoBox, hitTest, pointIn, videoSizeOf, videoToFrame } from "./box.js";

const CORNERS = ["nw", "ne", "sw", "se"];
const pct = (n) => `${n * 100}%`;

/**
 * The box drawn by hand over the live preview. Sits inside a `.frame` over the video: one finger draws a rectangle; once
 * one exists, a corner handle resizes it, a drag inside moves it, and a drag outside draws a new one. A tap changes
 * nothing. The box is kept in the video's own coordinates (what the watcher crops); gestures happen in the frame's, and
 * the two are mapped through the preview's object-fit: cover. `initial` seeds it; `onChange` gets each finished box.
 */
export default function BoxEditor({ initial = null, video, onChange }) {
  const surface = useRef(null);
  const gesture = useRef(null);
  const [box, setBox] = useState(initial);
  const [live, setLive] = useState(null);

  const rectOf = () => surface.current.getBoundingClientRect();
  const sizeOf = () => videoSizeOf(video?.current);
  const onPointerDown = (e) => {
    if (gesture.current) return;
    const rect = rectOf();
    const p = pointIn(rect, e.clientX, e.clientY);
    const start = box ? videoToFrame(box, rect, sizeOf()) : null;
    const part = hitTest(start, p, rect) || "draw";
    gesture.current = { id: e.pointerId, part, from: p, start };
    try { surface.current.setPointerCapture(e.pointerId); } catch { /* a browser without capture still gets the moves over the pad */ }
    e.preventDefault();
  };
  const onPointerMove = (e) => {
    const g = gesture.current;
    if (!g || g.id !== e.pointerId) return;
    const p = pointIn(rectOf(), e.clientX, e.clientY);
    setLive(g.part === "draw" ? boxFrom(g.from, p) : dragBox(g.start, g.part, g.from, p));
  };
  const onPointerUp = (e) => {
    const g = gesture.current;
    if (!g || g.id !== e.pointerId) return;
    gesture.current = null;
    setLive(null);
    const rect = rectOf();
    const p = pointIn(rect, e.clientX, e.clientY);
    const next = g.part === "draw" ? finishDraw(g.from, p, rect) : dragBox(g.start, g.part, g.from, p);
    if (!next) return;
    const inVideo = frameToVideoBox(next, rect, sizeOf());
    setBox(inVideo);
    onChange(inVideo);
  };
  const onPointerCancel = () => { gesture.current = null; setLive(null); };

  const shown = live || (box ? videoToFrame(box, FRAME, sizeOf()) : null);
  return (
    <div ref={surface} className="drawpad" onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerUp} onPointerCancel={onPointerCancel}>
      {shown && (
        <div className={`region editing ${live ? "live" : ""}`} style={{ left: pct(shown.x), top: pct(shown.y), width: pct(shown.w), height: pct(shown.h) }}>
          {!live && CORNERS.map((c) => <span key={c} className={`handle ${c}`} />)}
        </div>
      )}
    </div>
  );
}
