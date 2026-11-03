import React from "react";
import { AbsoluteFill, Audio, OffthreadVideo, Sequence, interpolate, staticFile, useCurrentFrame, useVideoConfig } from "remotion";

const PAPER = "#F2F4F6", INK = "#0B1220", SIGNAL = "#0E7490", BRAND = "#06B6D4", MUTED = "#5A6577", NIGHT = "#080D18";
const DISPLAY = "'Libre Caslon Display', Georgia, 'Times New Roman', serif";
const UI = "Geist, 'Helvetica Neue', Helvetica, Arial, sans-serif";
const MONO = "'Geist Mono', Menlo, monospace";

const fadeIn = (frame: number, n = 12) => interpolate(frame, [0, n], [0, 1], { extrapolateRight: "clamp" });
const rise = (frame: number, n = 14) => interpolate(frame, [0, n], [10, 0], { extrapolateRight: "clamp" });

const Dog: React.FC<{ size?: number }> = ({ size = 76 }) => (
  <svg width={size} height={size} viewBox="0 0 72 72" fill="none">
    <path d="M17 24c-7 3-11 15-7 26 1.4 3.8 5.6 4.6 7.8 1.4L25 40 17 24z" fill="#7C4A03" /><path d="M55 24c7 3 11 15 7 26-1.4 3.8-5.6 4.6-7.8 1.4L47 40l8-16z" fill="#7C4A03" />
    <circle cx="36" cy="36" r="23" fill="#E7C98A" stroke="#7C4A03" strokeWidth="2" /><ellipse cx="36" cy="44" rx="12" ry="9" fill="#F6E7C6" />
    <circle cx="27.5" cy="32" r="2.8" fill="#0B1220" /><circle cx="44.5" cy="32" r="2.8" fill="#0B1220" /><path d="M31 41.5h10c0 3.2-2.2 5.5-5 5.5s-5-2.3-5-5.5z" fill="#0B1220" />
    <path d="M36 47v3.2M36 50.2c-1.8 2.2-4.4 2.4-6 .6M36 50.2c1.8 2.2 4.4 2.4 6 .6" stroke="#0B1220" strokeWidth="1.8" strokeLinecap="round" /><path d="M19 55.5c6.5 4.5 27.5 4.5 34 0" stroke="#0E7490" strokeWidth="4.5" strokeLinecap="round" /><circle cx="36" cy="61" r="3" fill="#06B6D4" stroke="#0B1220" strokeWidth="1" />
  </svg>
);

const Callout: React.FC<{ text: string }> = ({ text }) => {
  const f = useCurrentFrame();
  return <div style={{ position: "absolute", left: 72, top: 72, opacity: fadeIn(f), transform: `translateY(${rise(f)}px)`, background: INK, color: "#F4F7FA", font: `500 26px/1.2 ${UI}`, padding: "16px 24px", borderRadius: 999, display: "flex", gap: 14, alignItems: "center" }}><span style={{ width: 12, height: 12, borderRadius: 6, background: BRAND, display: "inline-block" }} />{text}</div>;
};
const Caption: React.FC<{ text: string; who?: string; left?: number; width?: number; bottom?: number }> = ({ text, who, left = 72, width = 760, bottom = 96 }) => {
  const f = useCurrentFrame();
  const rosa = who === "rosa";
  return (
    <div style={{ position: "absolute", left, bottom, width, opacity: fadeIn(f), transform: `translateY(${rise(f)}px)` }}>
      {rosa && <div style={{ font: `500 22px ${MONO}`, letterSpacing: ".14em", textTransform: "uppercase", color: MUTED, marginBottom: 10 }}>Rosa says</div>}
      <div style={{ font: rosa ? `400 54px/1.15 ${DISPLAY}` : bottom && bottom < 60 ? `400 34px/1.2 ${DISPLAY}` : `400 42px/1.2 ${DISPLAY}`, color: INK }}>{rosa ? `“${text}”` : text}</div>
    </div>
  );
};
const Overlays: React.FC<{ seg: any; fps: number; left?: number; width?: number; bottom?: number }> = ({ seg, fps, left, width, bottom }) => (
  <>
    {(seg.callouts || []).map((c: any, i: number) => <Sequence key={`c${i}`} from={Math.round(c.at * fps)} durationInFrames={Math.round(c.dur * fps)}><Callout text={c.text} /></Sequence>)}
    {(seg.captions || []).map((c: any, i: number) => <Sequence key={`t${i}`} from={Math.round(c.at * fps)} durationInFrames={Math.round(c.dur * fps)}><Caption text={c.text} who={c.who} left={left} width={width} bottom={bottom} /></Sequence>)}
    {(seg.audio || []).map((a: any, i: number) => <Sequence key={`a${i}`} from={Math.round(a.at * fps)} durationInFrames={Math.max(1, Math.round((a.ms / 1000) * fps))}><Audio src={staticFile(a.file)} /></Sequence>)}
  </>
);

const Phone: React.FC<{ seg: any }> = ({ seg }) => {
  const { fps } = useVideoConfig(); const f = useCurrentFrame();
  const w = 464, h = 1004, x = 1160, y = 38;
  return (
    <AbsoluteFill style={{ background: PAPER, opacity: fadeIn(f, 10) }}>
      <div style={{ position: "absolute", left: 72, top: 60, display: "flex", alignItems: "center", gap: 18 }}><Dog size={60} /><span style={{ font: `400 30px ${DISPLAY}`, color: INK }}>Rosa's phone</span></div>
      <div style={{ position: "absolute", left: x - 16, top: y - 16, width: w + 32, height: h + 32, borderRadius: 64, background: "#101826", boxShadow: "0 40px 80px -30px rgba(11,18,32,.6)" }} />
      <div style={{ position: "absolute", left: x, top: y, width: w, height: h, borderRadius: 48, overflow: "hidden", background: "#000" }}>
        {/* Playwright pads the 390x844 page into the top-left of a 780x1688 frame: scale so the page fills the phone */}
        <OffthreadVideo src={staticFile(seg.video)} startFrom={Math.round(seg.from * fps)} endAt={Math.round(seg.to * fps)} muted style={{ width: 780, height: 1688, transformOrigin: "top left", transform: `scale(${w / 390})`, display: "block" }} />
      </div>
      <div style={{ position: "absolute", left: x + w / 2 - 70, top: y + 14, width: 140, height: 36, borderRadius: 18, background: "#101826" }} />
      <Overlays seg={seg} fps={fps} left={72} width={940} />
    </AbsoluteFill>
  );
};
const Laptop: React.FC<{ seg: any }> = ({ seg }) => {
  const { fps } = useVideoConfig(); const f = useCurrentFrame();
  const w = 1440, x = 240, y = 36, bar = 38;
  const vh = 900;
  return (
    <AbsoluteFill style={{ background: PAPER, opacity: fadeIn(f, 10) }}>
      <div style={{ position: "absolute", left: x, top: y, width: w, height: vh + bar, borderRadius: 18, overflow: "hidden", background: "#101826", boxShadow: "0 40px 80px -30px rgba(11,18,32,.5)" }}>
        <div style={{ height: bar, display: "flex", alignItems: "center", gap: 8, padding: "0 16px" }}>{["#FF5F57", "#FEBC2E", "#28C840"].map((c) => <span key={c} style={{ width: 12, height: 12, borderRadius: 6, background: c }} />)}<span style={{ marginLeft: 16, font: `400 15px ${MONO}`, color: "#97A3B6" }}>Ana's laptop</span></div>
        <OffthreadVideo src={staticFile(seg.video)} startFrom={Math.round(seg.from * fps)} endAt={Math.round(seg.to * fps)} muted style={{ width: w, height: vh, objectFit: "cover", display: "block" }} />
      </div>
      <Overlays seg={seg} fps={fps} left={240} width={1440} bottom={34} />
    </AbsoluteFill>
  );
};
const Card: React.FC<{ seg: any }> = ({ seg }) => {
  const { fps } = useVideoConfig(); const f = useCurrentFrame();
  return (
    <AbsoluteFill style={{ background: NIGHT, color: "#E7EDF6", opacity: fadeIn(f, 10) }}>
      <div style={{ position: "absolute", left: 160, top: 170, display: "flex", alignItems: "center", gap: 28 }}><Dog size={110} /><div><div style={{ font: `400 96px/1 ${DISPLAY}` }}>{seg.title}</div><div style={{ font: `400 28px ${MONO}`, letterSpacing: ".14em", textTransform: "uppercase", color: "#97A3B6", marginTop: 14 }}>{seg.subtitle}</div></div></div>
      <div style={{ position: "absolute", left: 160, top: 440, width: 1500 }}>
        {seg.lines.map((l: string, i: number) => <div key={i} style={{ font: `400 50px/1.3 ${DISPLAY}`, opacity: fadeIn(f - Math.round((0.9 + i * 2.6) * fps), 14), transform: `translateY(${rise(f - Math.round((0.9 + i * 2.6) * fps))}px)`, marginBottom: 18 }}>{l}</div>)}
      </div>
      <Overlays seg={seg} fps={fps} />
    </AbsoluteFill>
  );
};
const End: React.FC<{ seg: any }> = ({ seg }) => {
  const { fps } = useVideoConfig(); const f = useCurrentFrame();
  return (
    <AbsoluteFill style={{ background: NIGHT, color: "#E7EDF6", opacity: fadeIn(f, 10), justifyContent: "center", alignItems: "center" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 28 }}><Dog size={120} /><div style={{ font: `400 110px/1 ${DISPLAY}` }}>Biscuit</div></div>
      <div style={{ font: `400 40px ${DISPLAY}`, marginTop: 26, opacity: fadeIn(f - 20) }}>biscuit.kindred-ai.dev</div>
      <div style={{ font: `400 22px ${MONO}`, letterSpacing: ".1em", textTransform: "uppercase", color: "#97A3B6", marginTop: 40, opacity: fadeIn(f - 45), textAlign: "center", lineHeight: 1.9 }}>SAM 3.1 · Muse Voice Transcribe · Muse Spark 1.3 on Meta Model API<br />Open source · github.com/Fluffy-SHIBAINU/biscuit<br />Kindred AI · Waive · Lull</div>
      <Overlays seg={seg} fps={fps} />
    </AbsoluteFill>
  );
};

export const Demo: React.FC<{ timeline: { fps: number; segments: any[] } }> = ({ timeline }) => {
  const { fps } = useVideoConfig();
  let at = 0;
  return (
    <AbsoluteFill style={{ background: PAPER, fontFamily: UI }}>
      {timeline.segments.map((seg, i) => {
        const from = at; const frames = Math.round(seg.dur * fps); at += frames;
        const El = seg.kind === "phone" ? Phone : seg.kind === "laptop" ? Laptop : seg.kind === "card" ? Card : End;
        return <Sequence key={i} from={from} durationInFrames={frames}><El seg={seg} /></Sequence>;
      })}
    </AbsoluteFill>
  );
};
