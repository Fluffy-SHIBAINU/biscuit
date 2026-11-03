import React from "react";
import { AbsoluteFill, Audio, Img, OffthreadVideo, Sequence, interpolate, spring, staticFile, useCurrentFrame, useVideoConfig } from "remotion";

const PAPER = "#F2F4F6", INK = "#0B1220", BRAND = "#06B6D4", MUTED = "#5A6577", NIGHT = "#080D18", LIGHT = "#F4F7FA";
const DISPLAY = "'Libre Caslon Display', Georgia, 'Times New Roman', serif";
const UI = "Geist, 'Helvetica Neue', Helvetica, Arial, sans-serif";
const MONO = "'Geist Mono', Menlo, monospace";

const fadeIn = (frame: number, n = 12) => interpolate(frame, [0, n], [0, 1], { extrapolateRight: "clamp", extrapolateLeft: "clamp" });
const rise = (frame: number, n = 14) => interpolate(frame, [0, n], [10, 0], { extrapolateRight: "clamp", extrapolateLeft: "clamp" });
const ease = (t: number) => (t <= 0 ? 0 : t >= 1 ? 1 : (1 - Math.cos(Math.PI * t)) / 2);
/** A push: the frame zooms in on a point for a while, eases in over 0.7 s and out over 0.5 s. */
function pushAt(pushes: any[] | undefined, t: number) {
  for (const p of pushes || []) {
    if (t < p.at || t > p.at + p.dur) continue;
    const k = t - p.at, inT = 0.7, outT = 0.5;
    const s = k < inT ? ease(k / inT) : k > p.dur - outT ? ease((p.dur - k) / outT) : 1;
    return { x: p.x, y: p.y, scale: 1 + (p.scale - 1) * s };
  }
  return null;
}
/** Shots overlap by the crossfade: each one fades in over the one before. */
const XFADE = 12;
const enter = (f: number) => ({ opacity: fadeIn(f, XFADE) });
const slide = (f: number) => ({ transform: `translateX(${interpolate(f, [0, 16], [36, 0], { extrapolateRight: "clamp", easing: (x) => 1 - Math.pow(1 - x, 3) })}px)` });

const Dog: React.FC<{ size?: number }> = ({ size = 76 }) => (
  <svg width={size} height={size} viewBox="0 0 72 72" fill="none">
    <path d="M17 24c-7 3-11 15-7 26 1.4 3.8 5.6 4.6 7.8 1.4L25 40 17 24z" fill="#7C4A03" /><path d="M55 24c7 3 11 15 7 26-1.4 3.8-5.6 4.6-7.8 1.4L47 40l8-16z" fill="#7C4A03" />
    <circle cx="36" cy="36" r="23" fill="#E7C98A" stroke="#7C4A03" strokeWidth="2" /><ellipse cx="36" cy="44" rx="12" ry="9" fill="#F6E7C6" />
    <circle cx="27.5" cy="32" r="2.8" fill="#0B1220" /><circle cx="44.5" cy="32" r="2.8" fill="#0B1220" /><path d="M31 41.5h10c0 3.2-2.2 5.5-5 5.5s-5-2.3-5-5.5z" fill="#0B1220" />
    <path d="M36 47v3.2M36 50.2c-1.8 2.2-4.4 2.4-6 .6M36 50.2c1.8 2.2 4.4 2.4 6 .6" stroke="#0B1220" strokeWidth="1.8" strokeLinecap="round" /><path d="M19 55.5c6.5 4.5 27.5 4.5 34 0" stroke="#0E7490" strokeWidth="4.5" strokeLinecap="round" /><circle cx="36" cy="61" r="3" fill="#06B6D4" stroke="#0B1220" strokeWidth="1" />
  </svg>
);

const Callout: React.FC<{ text: string; left?: number; top?: number }> = ({ text, left = 72, top = 150 }) => {
  const f = useCurrentFrame();
  return <div style={{ position: "absolute", left, top, opacity: fadeIn(f), transform: `translateY(${rise(f)}px)`, background: INK, color: LIGHT, font: `500 26px/1.2 ${UI}`, padding: "16px 24px", borderRadius: 999, display: "flex", gap: 14, alignItems: "center", boxShadow: "0 10px 30px -10px rgba(0,0,0,.5)" }}><span style={{ width: 12, height: 12, borderRadius: 6, background: BRAND, display: "inline-block" }} />{text}</div>;
};
const Caption: React.FC<{ text: string; who?: string; left?: number; width?: number; bottom?: number; light?: boolean }> = ({ text, who, left = 72, width = 760, bottom = 96, light }) => {
  const f = useCurrentFrame();
  const rosa = who === "rosa";
  const color = light ? LIGHT : INK;
  return (
    <div style={{ position: "absolute", left, bottom, width, opacity: fadeIn(f), transform: `translateY(${rise(f)}px)`, textShadow: light ? "0 2px 18px rgba(0,0,0,.55)" : undefined }}>
      {rosa && <div style={{ font: `500 22px ${MONO}`, letterSpacing: ".14em", textTransform: "uppercase", color: light ? "#D5DCE8" : MUTED, marginBottom: 10 }}>Rosa says</div>}
      <div style={{ font: rosa ? `400 54px/1.15 ${DISPLAY}` : bottom && bottom < 60 ? `400 34px/1.2 ${DISPLAY}` : `400 42px/1.2 ${DISPLAY}`, color }}>{rosa ? `“${text}”` : text}</div>
    </div>
  );
};
/** A number or a phrase that lands with the word: springs up, holds, fades. */
const Kinetic: React.FC<{ text: string; sub?: string; light?: boolean; left?: number; top?: number; size?: number }> = ({ text, sub, light, left = 120, top = 330, size = 150 }) => {
  const f = useCurrentFrame(); const { fps } = useVideoConfig();
  const s = spring({ frame: f, fps, config: { damping: 16, stiffness: 140, mass: 0.9 } });
  return (
    <div style={{ position: "absolute", left, top, width: 1100, opacity: fadeIn(f, 6), transform: `translateY(${(1 - s) * 40}px) scale(${0.94 + 0.06 * s})`, transformOrigin: "left center", color: light ? LIGHT : INK, textShadow: light ? "0 2px 24px rgba(0,0,0,.6)" : undefined }}>
      <div style={{ font: `400 ${size}px/1 ${DISPLAY}`, letterSpacing: "-.01em", textWrap: "balance" as any }}>{text}</div>
      {sub && <div style={{ font: `400 36px/1.3 ${UI}`, color: light ? "#D5DCE8" : MUTED, marginTop: 22, opacity: fadeIn(f - 10, 10) }}>{sub}</div>}
    </div>
  );
};
/** A scene picture with a slow camera move: a gentle push and drift over the shot. */
const Scene: React.FC<{ src: string; dur: number; drift?: number; style?: React.CSSProperties }> = ({ src, dur, drift = 1, style }) => {
  const f = useCurrentFrame(); const { fps } = useVideoConfig();
  const t = Math.min(1, f / fps / Math.max(1, dur));
  const scale = 1.04 + 0.08 * t;
  return <Img src={staticFile(src)} style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover", transformOrigin: "50% 50%", transform: `scale(${scale}) translate(${drift * (8 - 16 * t)}px, ${4 - 8 * t}px)`, ...style }} />;
};
const Overlays: React.FC<{ seg: any; fps: number; left?: number; width?: number; bottom?: number; calloutLeft?: number; calloutTop?: number; light?: boolean }> = ({ seg, fps, left, width, bottom, calloutLeft, calloutTop, light }) => (
  <>
    {(seg.callouts || []).map((c: any, i: number) => <Sequence key={`c${i}`} from={Math.round(c.at * fps)} durationInFrames={Math.round(c.dur * fps)}><Callout text={c.text} left={calloutLeft} top={calloutTop} /></Sequence>)}
    {(seg.captions || []).map((c: any, i: number) => <Sequence key={`t${i}`} from={Math.round(c.at * fps)} durationInFrames={Math.round(c.dur * fps)}><Caption text={c.text} who={c.who} left={left} width={width} bottom={bottom} light={light} /></Sequence>)}
    {(seg.kinetic || []).map((k: any, i: number) => <Sequence key={`k${i}`} from={Math.round(k.at * fps)} durationInFrames={Math.round(k.dur * fps)}><Kinetic text={k.text} sub={k.sub} light={seg.kind === "hook"} /></Sequence>)}
    {(seg.audio || []).map((a: any, i: number) => <Sequence key={`a${i}`} from={Math.round(a.at * fps)} durationInFrames={Math.max(1, Math.round((a.ms / 1000) * fps))}><Audio src={staticFile(a.file)} /></Sequence>)}
  </>
);

const Phone: React.FC<{ seg: any }> = ({ seg }) => {
  const { fps } = useVideoConfig(); const f = useCurrentFrame();
  const w = 464, h = 1004, x = 1160, y = 38;
  const p = pushAt(seg.push, f / fps);
  const scene = seg.scene as string | undefined;
  return (
    <AbsoluteFill style={{ background: PAPER, ...enter(f) }}>
      {scene ? (
        <div style={{ position: "absolute", left: 72, top: 60, width: 1016, height: 960, borderRadius: 28, overflow: "hidden", boxShadow: "0 40px 80px -40px rgba(11,18,32,.55)" }}>
          <Scene src={scene} dur={seg.dur} drift={seg.drift ?? 1} />
          <div style={{ position: "absolute", inset: 0, background: "linear-gradient(180deg, rgba(8,13,24,.0) 55%, rgba(8,13,24,.72) 100%)" }} />
        </div>
      ) : (
        <div style={{ position: "absolute", left: 72, top: 60, display: "flex", alignItems: "center", gap: 18 }}><Dog size={60} /><span style={{ font: `400 30px ${DISPLAY}`, color: INK }}>Rosa's phone</span></div>
      )}
      <div style={{ position: "absolute", inset: 0, ...slide(f) }}>
        <div style={{ position: "absolute", left: x - 16, top: y - 16, width: w + 32, height: h + 32, borderRadius: 64, background: "#101826", boxShadow: "0 40px 80px -30px rgba(11,18,32,.6)" }} />
        <div style={{ position: "absolute", left: x, top: y, width: w, height: h, borderRadius: 48, overflow: "hidden", background: "#000" }}>
          {/* Playwright pads the 390x844 page into the top-left of a 780x1688 frame: scale so the page fills the phone; a push zooms on a point of the page */}
          <div style={{ width: 780, height: 1688, transformOrigin: "top left", transform: `scale(${w / 390})` }}>
            <div style={{ width: 780, height: 1688, transformOrigin: p ? `${p.x}px ${p.y}px` : "top left", transform: p ? `scale(${p.scale})` : undefined }}>
              <OffthreadVideo src={staticFile(seg.video)} startFrom={Math.round(seg.from * fps)} endAt={Math.round(seg.to * fps)} muted style={{ width: 780, height: 1688, display: "block" }} />
            </div>
          </div>
        </div>
        <div style={{ position: "absolute", left: x + w / 2 - 70, top: y + 14, width: 140, height: 36, borderRadius: 18, background: "#101826" }} />
      </div>
      <Overlays seg={seg} fps={fps} left={scene ? 120 : 72} width={scene ? 900 : 940} bottom={scene ? 110 : 96} calloutLeft={scene ? 112 : 72} calloutTop={scene ? 100 : 150} light={Boolean(scene)} />
    </AbsoluteFill>
  );
};
const Laptop: React.FC<{ seg: any }> = ({ seg }) => {
  const { fps } = useVideoConfig(); const f = useCurrentFrame();
  const w = 1440, x = 240, y = 36, bar = 38, vh = 900;
  const p = pushAt(seg.push, f / fps);
  return (
    <AbsoluteFill style={{ background: PAPER, ...enter(f) }}>
      <div style={{ position: "absolute", left: x, top: y, width: w, height: vh + bar, borderRadius: 18, overflow: "hidden", background: "#101826", boxShadow: "0 40px 80px -30px rgba(11,18,32,.5)", ...slide(f) }}>
        <div style={{ height: bar, display: "flex", alignItems: "center", gap: 8, padding: "0 16px" }}>{["#FF5F57", "#FEBC2E", "#28C840"].map((c) => <span key={c} style={{ width: 12, height: 12, borderRadius: 6, background: c }} />)}<span style={{ marginLeft: 16, font: `400 15px ${MONO}`, color: "#97A3B6" }}>Ana's laptop</span></div>
        <div style={{ width: w, height: vh, overflow: "hidden" }}>
          <div style={{ width: w, height: vh, transformOrigin: p ? `${p.x}px ${p.y}px` : "top left", transform: p ? `scale(${p.scale})` : undefined }}>
            <OffthreadVideo src={staticFile(seg.video)} startFrom={Math.round(seg.from * fps)} endAt={Math.round(seg.to * fps)} muted style={{ width: w, height: vh, objectFit: "cover", display: "block" }} />
          </div>
        </div>
      </div>
      <Overlays seg={seg} fps={fps} left={240} width={1440} bottom={34} calloutLeft={300} calloutTop={120} />
    </AbsoluteFill>
  );
};
const Card: React.FC<{ seg: any }> = ({ seg }) => {
  const { fps } = useVideoConfig(); const f = useCurrentFrame();
  const s = spring({ frame: f, fps, config: { damping: 18, stiffness: 120 } });
  return (
    <AbsoluteFill style={{ background: NIGHT, color: "#E7EDF6", ...enter(f), justifyContent: "center", alignItems: "center" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 34, transform: `scale(${0.92 + 0.08 * s})` }}><Dog size={150} /><div><div style={{ font: `400 150px/1 ${DISPLAY}` }}>{seg.title}</div><div style={{ font: `400 30px ${MONO}`, letterSpacing: ".14em", textTransform: "uppercase", color: "#97A3B6", marginTop: 18 }}>{seg.subtitle}</div></div></div>
      {(seg.lines || []).map((l: string, i: number) => <div key={i} style={{ font: `400 50px/1.3 ${DISPLAY}`, opacity: fadeIn(f - Math.round((0.9 + i * 2.6) * fps), 14), marginTop: 18 }}>{l}</div>)}
      <Overlays seg={seg} fps={fps} />
    </AbsoluteFill>
  );
};
/** The bill, then Rosa, then the bill again, slowly pushed in; the stakes land as words. */
const Hook: React.FC<{ seg: any }> = ({ seg }) => {
  const { fps } = useVideoConfig(); const f = useCurrentFrame();
  const t = f / fps; const scale = 1.08 + 0.12 * (t / seg.dur);
  return (
    <AbsoluteFill style={{ background: NIGHT, overflow: "hidden" }}>
      <Img src={staticFile(seg.image)} style={{ position: "absolute", left: 480, top: -40, width: 1440, height: 1080, objectFit: "cover", objectPosition: "top", transformOrigin: "60% 30%", transform: `scale(${scale})`, opacity: fadeIn(f, 20) }} />
      {(seg.scenes || []).map((s: any, i: number) => <Sequence key={i} from={Math.round(s.at * fps)} durationInFrames={Math.round(s.dur * fps)}><HookScene src={s.src} dur={s.dur} /></Sequence>)}
      <div style={{ position: "absolute", inset: 0, background: "linear-gradient(90deg, rgba(8,13,24,1) 30%, rgba(8,13,24,.78) 52%, rgba(8,13,24,.05) 100%)" }} />
      <div style={{ position: "absolute", left: 120, top: 110, display: "flex", alignItems: "center", gap: 16, opacity: fadeIn(f - 4, 12) }}><Dog size={44} /><span style={{ font: `400 24px ${MONO}`, letterSpacing: ".14em", textTransform: "uppercase", color: "#97A3B6" }}>Biscuit · Kindred AI</span></div>
      <Overlays seg={seg} fps={fps} />
    </AbsoluteFill>
  );
};
const HookScene: React.FC<{ src: string; dur: number }> = ({ src, dur }) => {
  const f = useCurrentFrame(); const { fps } = useVideoConfig();
  const out = fadeIn(Math.round(dur * fps) - f, 14);
  return <div style={{ position: "absolute", left: 480, top: 0, width: 1440, height: 1080, opacity: Math.min(fadeIn(f, 16), out) }}><Scene src={src} dur={dur} drift={-1} /></div>;
};
/** Behind the scenes: the models, named once, on screen only. */
const Meta: React.FC<{ seg: any }> = ({ seg }) => {
  const { fps } = useVideoConfig(); const f = useCurrentFrame();
  return (
    <AbsoluteFill style={{ background: NIGHT, color: "#E7EDF6", ...enter(f) }}>
      <div style={{ position: "absolute", left: 160, top: 150, font: `400 26px ${MONO}`, letterSpacing: ".16em", textTransform: "uppercase", color: "#97A3B6" }}>Behind the scenes</div>
      <div style={{ position: "absolute", left: 160, top: 200, font: `400 96px/1.05 ${DISPLAY}` }}>Powered by Meta AI</div>
      <div style={{ position: "absolute", left: 160, top: 380, width: 1600 }}>
        {seg.rows.map(([name, what]: [string, string], i: number) => { const g = f - Math.round((1.6 + i * 2.6) * fps); return (
          <div key={name} style={{ display: "flex", alignItems: "baseline", gap: 40, padding: "26px 0", borderTop: "1px solid rgba(151,163,182,.25)", opacity: fadeIn(g, 12), transform: `translateY(${rise(g)}px)` }}>
            <span style={{ width: 14, height: 14, borderRadius: 7, background: BRAND, alignSelf: "center", flex: "none" }} /><span style={{ font: `500 44px ${UI}`, width: 620 }}>{name}</span><span style={{ font: `400 44px ${DISPLAY}`, color: "#C9D2E0" }}>{what}</span>
          </div>); })}
      </div>
      <div style={{ position: "absolute", left: 160, bottom: 110, font: `400 24px ${MONO}`, letterSpacing: ".1em", textTransform: "uppercase", color: "#97A3B6", lineHeight: 1.9, opacity: fadeIn(f - Math.round(10 * fps), 14) }}>Meta Model API · open source · github.com/Fluffy-SHIBAINU/biscuit<br />Kindred AI · Biscuit · Waive · Lull</div>
      <Overlays seg={seg} fps={fps} />
    </AbsoluteFill>
  );
};
/** The family, the bill stamped Sent, the line, and the door. */
const Payoff: React.FC<{ seg: any }> = ({ seg }) => {
  const { fps } = useVideoConfig(); const f = useCurrentFrame();
  const stamp = spring({ frame: f - Math.round(1.3 * fps), fps, config: { damping: 12, stiffness: 220 } });
  const end = fadeIn(f - Math.round(4.3 * fps), 16);
  return (
    <AbsoluteFill style={{ background: NIGHT, color: "#E7EDF6", ...enter(f), overflow: "hidden" }}>
      {seg.backdrop && <div style={{ position: "absolute", inset: 0, opacity: 0.55 }}><Scene src={seg.backdrop} dur={seg.dur} drift={-1} /></div>}
      <div style={{ position: "absolute", inset: 0, background: "linear-gradient(90deg, rgba(8,13,24,.55) 0%, rgba(8,13,24,.82) 48%, rgba(8,13,24,.96) 100%)" }} />
      <div style={{ position: "absolute", left: 150, top: 120, width: 620, height: 840, overflow: "hidden", borderRadius: 8, transform: "rotate(-2.5deg)", boxShadow: "0 50px 90px -30px rgba(0,0,0,.8)" }}>
        <Img src={staticFile(seg.image)} style={{ width: 1000, height: 750, objectFit: "cover", display: "block", marginLeft: -190, marginTop: 30 }} />
      </div>
      <div style={{ position: "absolute", left: 250, top: 330, padding: "14px 28px", border: `8px solid ${BRAND}`, borderRadius: 14, color: BRAND, font: `700 54px ${UI}`, letterSpacing: ".06em", textTransform: "uppercase", transform: `rotate(-12deg) scale(${0.6 + 0.4 * stamp})`, opacity: stamp, background: "rgba(8,13,24,.55)" }}>Sent to Ana</div>
      <div style={{ position: "absolute", left: 900, top: 150, width: 920 }}>
        <div style={{ font: `400 24px ${MONO}`, letterSpacing: ".14em", textTransform: "uppercase", color: "#97A3B6", opacity: fadeIn(f - 6) }}>Massachusetts General Hospital · its own rule</div>
        <div style={{ font: `italic 400 46px/1.3 ${DISPLAY}`, marginTop: 22, color: "#C9D2E0", opacity: fadeIn(f - 12) }}>“Family Income % FPG Discount 0 to 150% 100%”</div>
        <div style={{ font: `400 66px/1.1 ${DISPLAY}`, marginTop: 40, opacity: fadeIn(f - Math.round(1.9 * fps), 14), transform: `translateY(${rise(f - Math.round(1.9 * fps))}px)`, textWrap: "balance" as any }}>Biscuit Helps Rosa and Ana Save on Healthcare Bills.</div>
        <div style={{ font: `400 40px/1.2 ${DISPLAY}`, marginTop: 22, color: "#C9D2E0", opacity: fadeIn(f - Math.round(3.6 * fps), 14), transform: `translateY(${rise(f - Math.round(3.6 * fps))}px)` }}>Powered by Meta and Kindred AI.</div>
      </div>
      <div style={{ position: "absolute", left: 900, bottom: 80, opacity: end, transform: `translateY(${(1 - end) * 12}px)` }}>
        <div style={{ display: "flex", alignItems: "center", gap: 22 }}><Dog size={84} /><div><div style={{ font: `400 72px/1 ${DISPLAY}` }}>Biscuit</div><div style={{ font: `400 30px ${DISPLAY}`, marginTop: 8, color: "#C9D2E0" }}>biscuit.kindred-ai.dev</div></div></div>
        <div style={{ font: `400 20px ${MONO}`, letterSpacing: ".1em", textTransform: "uppercase", color: "#97A3B6", marginTop: 22, lineHeight: 1.9 }}>Open source · github.com/Fluffy-SHIBAINU/biscuit<br />Kindred AI · Waive · Lull</div>
      </div>
      <Overlays seg={seg} fps={fps} />
    </AbsoluteFill>
  );
};

const KIND: Record<string, React.FC<{ seg: any }>> = { phone: Phone, laptop: Laptop, card: Card, hook: Hook, meta: Meta, payoff: Payoff };

export const Demo: React.FC<{ timeline: { fps: number; vo?: any[]; segments: any[] } }> = ({ timeline }) => {
  const { fps } = useVideoConfig();
  return (
    <AbsoluteFill style={{ background: PAPER, fontFamily: UI, WebkitFontSmoothing: "antialiased" as any }}>
      {timeline.segments.map((seg, i) => {
        const El = KIND[seg.kind] || Card;
        return <Sequence key={i} from={Math.round(seg.start * fps)} durationInFrames={Math.round(seg.dur * fps)}><El seg={seg} /></Sequence>;
      })}
      {(timeline.vo || []).map((n, i) => <Sequence key={`vo${i}`} from={Math.round(n.at * fps)} durationInFrames={Math.max(1, Math.round((n.ms / 1000) * fps))}><Audio src={staticFile(n.file)} /></Sequence>)}
    </AbsoluteFill>
  );
};
