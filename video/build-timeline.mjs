// From events.json (what each scene did and when) to public/timeline.json (what the composition shows and plays), and
// the media copied into public/. Times in seconds.
import { readFileSync, writeFileSync, mkdirSync, copyFileSync, existsSync, readdirSync, statSync } from "node:fs";
import { basename, dirname, join } from "node:path";
const V = "/Users/grey/Desktop/dev/biscuit/video";
const ev = JSON.parse(readFileSync(`${V}/events.json`, "utf8"));
const narr = JSON.parse(readFileSync(`${V}/narration.json`, "utf8"));
mkdirSync(`${V}/public/media`, { recursive: true }); mkdirSync(`${V}/public/audio`, { recursive: true });
// the scene's own page first, then the pages it opened (Waive, Lull), in the order they were opened
const videosOf = (scene) => { const main = ev[scene].video; const d = dirname(main); const others = readdirSync(d).filter((f) => f.endsWith(".webm")).map((f) => join(d, f)).filter((f) => f !== main).sort((a, b) => statSync(a).mtimeMs - statSync(b).mtimeMs); return [main, ...others]; };
const media = (path) => { const name = basename(path); if (!existsSync(`${V}/public/media/${name}`)) copyFileSync(path, `${V}/public/media/${name}`); return `media/${name}`; };
const audioFile = (file) => { const name = basename(file); const src = file.startsWith("/") ? file : `${V}/${file}`; if (!existsSync(`${V}/public/audio/${name}`)) copyFileSync(src, `${V}/public/audio/${name}`); return `audio/${name}`; };
const s = (ms) => ms / 1000;
const mark = (scene, name) => { const m = ev[scene].events.find((e) => e.type === "mark" && e.name === name); return m ? s(m.t) : null; };

/** Biscuit's lines in a scene between two times, each at the moment its clip began playing, with the clip file. */
function linesIn(scene, from, to, { skip = [] } = {}) {
  const E = ev[scene].events; const A = ev[scene].audio;
  const plays = E.filter((e) => e.type === "play" && (e.duration ?? 1) > 0.2).map((e) => ({ t: s(e.t), used: false }));
  const out = []; const lines = E.filter((x) => x.type === "line");
  for (const e of lines) {
    const clip = A.find((a) => a.text === e.text); if (!clip) continue;
    const play = plays.find((p) => !p.used && p.t >= s(e.t) - 0.05 && p.t <= s(e.t) + 8);
    // only the latest line sounds: a line asked for well before this one's clip started took its place, so this one never played
    if (play && lines.some((l) => s(l.t) > s(e.t) && s(l.t) < play.t - 0.5)) continue;
    if (play) play.used = true;
    const at = play ? play.t : s(e.t) + 1.2;
    if (skip.some((r) => r.test(e.text))) continue;
    if (at < from || at > to) continue;
    out.push({ at: at - from, file: audioFile(clip.file), ms: clip.ms, text: e.text });
  }
  return out;
}
const rosaIn = (scene, from, to) => ev[scene].events.filter((e) => e.type === "rosa" && s(e.t) >= from && s(e.t) <= to).map((e) => ({ at: s(e.t) - from, dur: 3.5, text: e.text, who: "rosa" }));
const HELLO = /^Hello! Biscuit here/;
const segs = [];

// 1 cold open: the chime and his question
{ const sc = "rosa-loop", to = ev[sc].events.find((e) => e.type === "rosa").t / 1000 + 0.6;
  // the chime screen two seconds before his first word, however long the voice took to arrive
  const woof = ev[sc].events.find((e) => e.type === "line" && /^Woof/.test(e.text)); const wplay = ev[sc].events.find((e) => e.type === "play" && e.t >= woof.t);
  const from = Math.max(mark(sc, "mail") - 0.2, s(wplay.t) - 2.2);
  segs.push({ kind: "phone", video: media(videosOf(sc)[0]), from, to, audio: linesIn(sc, from, to, { skip: [HELLO] }), captions: [{ at: 0.4, dur: 4, text: "The mail came.", who: "title" }], callouts: [] }); }
// 2 why
segs.push({ kind: "card", dur: 10.5, title: "Biscuit", subtitle: "by Kindred AI", lines: ["Rosa is 78 and lives alone.", "She gets mail she can't read, and bills she may not owe.", "Ana lives across town."], audio: [{ at: 0.6, file: audioFile(narr["narr-why"].file), ms: narr["narr-why"].ms }] });
// 3 Ana's setup
{ const sc = "ana-setup", from = 0.6, to = 8.2;
  segs.push({ kind: "laptop", video: media(videosOf(sc)[0]), from, to, audio: [{ at: 0.3, file: audioFile(narr["narr-setup"].file), ms: narr["narr-setup"].ms }], captions: [{ at: 0.2, dur: 7.5, text: "Ana, on her laptop: who Biscuit helps, then a code for Rosa's phone.", who: "title" }], callouts: [] }); }
// 4 Rosa's setup
{ const sc = "rosa-setup", from = mark(sc, "code-screen") - 0.3, to = mark(sc, "home") + 0.5;
  // each caption holds until the next step's screen, so two never overlap
  const steps = [["code-screen", "Rosa types the code."], ["voice", "Say hello."], ["consent", "Her yes, read aloud."], ["help-setup", "Help, set up."], ["done", "Ready."]];
  const caps = steps.map(([m, text], i) => { const at = mark(sc, m) - from; const next = steps[i + 1] ? mark(sc, steps[i + 1][0]) - from : to - from; return { at, dur: Math.max(1, Math.min(3, next - at - 0.15)), text, who: "title" }; });
  segs.push({ kind: "phone", video: media(videosOf(sc)[0]), from, to, audio: [], captions: caps, callouts: [{ at: 0.5, dur: 6, text: "Four steps on her phone" }] }); }
// 5 the loop
{ const sc = "rosa-loop", from = ev[sc].events.find((e) => e.type === "rosa").t / 1000 - 0.3, to = mark(sc, "sent") + 2.4;
  const at = (m) => mark(sc, m) - from;
  const done = ev[sc].events.find((e) => e.type === "line" && /^Done!/.test(e.text));
  const tap = done ? [{ at: s(done.t) - from - 0.4, dur: 3.5, text: "She taps: Yes, Start It with Ana.", who: "title" }] : [];
  segs.push({ kind: "phone", video: media(videosOf(sc)[0]), from, to, audio: linesIn(sc, from, to, { skip: [HELLO] }), captions: [...rosaIn(sc, from, to), ...tap],
    callouts: [{ at: at("camera") + 0.2, dur: 5, text: "SAM 3.1 checks the frame" }, { at: at("reading") - 7, dur: 6.5, text: "Muse Spark 1.3 reads the page" }, { at: at("reading") + 1, dur: 6, text: "Every number inside a quote from the page" }, { at: at("questions") + 1, dur: 7, text: "Muse Voice Transcribe turns her words into text" }, { at: at("offer") - 3, dur: 8, text: "The hospital's own rule, from Waive" }, { at: at("sent") + 0.3, dur: 5, text: "Handed to Ana" }] }); }
// 6 Ana's page, Waive, Lull
{ const sc = "ana-page"; const vids = videosOf(sc);
  // the family page stays on the main recording while the Waive page is open in its own, so this shot runs a little past the click
  const fam0 = mark(sc, "family") - 2.0, wv = mark(sc, "waive") + 3.5, end = mark(sc, "recent") + 2, famDur = wv - fam0;
  segs.push({ kind: "laptop", video: media(vids[0]), from: fam0, to: wv, audio: [{ at: 0.4, file: audioFile(narr["narr-ana"].file), ms: narr["narr-ana"].ms }], captions: [{ at: 0.3, dur: 3.2, text: "Welcome, Ana, with Rosa.", who: "title" }, { at: 3.6, dur: famDur - 3.8, text: "The bill, under Today, in Rosa's words. A dot on the day it is due.", who: "title" }], callouts: [] });
  // the Waive page as it opened; the Lull page once it had loaded (its first seconds say "Opening Lull")
  if (vids[1]) segs.push({ kind: "laptop", video: media(vids[1]), from: 0.4, to: 6.8, audio: [{ at: 0.4, file: audioFile(narr["narr-waive"].file), ms: narr["narr-waive"].ms }], captions: [{ at: 0.3, dur: 6, text: "The hospital's own rule, in Waive. The application starts here.", who: "title" }], callouts: [{ at: 0.3, dur: 6, text: "Waive · waive.kindred-ai.dev" }] });
  if (vids[2]) segs.push({ kind: "laptop", video: media(vids[2]), from: 5.0, to: 9.4, audio: [{ at: 0.3, file: audioFile(narr["narr-lull"].file), ms: narr["narr-lull"].ms }], captions: [{ at: 0.3, dur: 4, text: "Lull: the Medicare programs that cover a caregiver's break, quoting the rule.", who: "title" }], callouts: [{ at: 0.3, dur: 4, text: "Lull · lull.kindred-ai.dev" }] });
  segs.push({ kind: "laptop", video: media(vids[0]), from: end - 5.4, to: end, audio: [{ at: 0.2, file: audioFile(narr["narr-mailbox"].file), ms: narr["narr-mailbox"].ms }], captions: [{ at: 0.2, dur: 5.2, text: "The mailbox phone and the day, on the same page.", who: "title" }], callouts: [{ at: 0.2, dur: 5.2, text: "SAM 3.1 watches the box" }] }); }
// 7 companion and Help
{ const sc = "rosa-companion", from = mark(sc, "home") - 0.4, to = mark(sc, "help") + 5.2;
  const at = (m) => mark(sc, m) - from;
  segs.push({ kind: "phone", video: media(videosOf(sc)[0]), from, to, audio: linesIn(sc, from, to, { skip: [HELLO] }), captions: rosaIn(sc, from, to),
    callouts: [{ at: 0.3, dur: 4, text: "Just talk to him" }, { at: at("settings") + 0.3, dur: 2.5, text: "The reminder, kept" }, { at: at("pause") + 0.2, dur: 3, text: "Pause: the ear closes" }, { at: at("hold") - 0.3, dur: 3, text: "Help: hold two seconds" }, { at: at("help") + 0.4, dur: 4.5, text: "Ana's phone buzzed" }] }); }
// 8 close
segs.push({ kind: "end", dur: 8, audio: [{ at: 0.5, file: audioFile(narr["narr-end"].file), ms: narr["narr-end"].ms }] });

for (const g of segs) g.dur = g.dur ?? g.to - g.from;
const total = segs.reduce((n, g) => n + g.dur, 0);
writeFileSync(`${V}/public/timeline.json`, JSON.stringify({ fps: 30, segments: segs }, null, 1));
console.log(segs.map((g, i) => `${i + 1}. ${g.kind} ${g.dur.toFixed(1)}s audio=${g.audio?.length || 0}`).join("\n"));
console.log(`total ${total.toFixed(1)} s`);
