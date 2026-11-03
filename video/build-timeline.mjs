// The second cut: one story, the founder's narration over the recordings. From events.json (what each scene did and
// when), vo.json (the narrator's lines) and the recordings in raw/ to public/timeline.json and the media under public/.
// Times in seconds. The narration is one track with absolute times; Biscuit's lines sit inside their segments.
import { readFileSync, writeFileSync, mkdirSync, copyFileSync, existsSync, readdirSync, statSync } from "node:fs";
import { execSync } from "node:child_process";
import { basename, dirname, join } from "node:path";
const V = "/Users/grey/Desktop/dev/biscuit/video";
const ev = JSON.parse(readFileSync(`${V}/events.json`, "utf8"));
const vo = JSON.parse(readFileSync(`${V}/vo.json`, "utf8"));
mkdirSync(`${V}/public/media`, { recursive: true }); mkdirSync(`${V}/public/audio`, { recursive: true });
if (!existsSync(`${V}/public/media/bill.png`)) copyFileSync(`${V}/assets/bill.png`, `${V}/public/media/bill.png`);
// the scene's own page first, then the pages it opened (Waive, Lull), in the order they were opened
const videosOf = (scene) => { const main = ev[scene].video; const d = dirname(main); const others = readdirSync(d).filter((f) => f.endsWith(".webm")).map((f) => join(d, f)).filter((f) => f !== main).sort((a, b) => statSync(a).mtimeMs - statSync(b).mtimeMs); return [main, ...others]; };
// Playwright's recordings have a variable frame rate and Remotion drops blank frames on them: each becomes a constant
// 30 fps H.264 file once
const media = (path) => { const name = basename(path, ".webm") + ".mp4"; const out = `${V}/public/media/${name}`; if (!existsSync(out)) { console.log("transcoding", basename(path)); execSync(`ffmpeg -loglevel error -y -i "${path}" -vf fps=30 -c:v libx264 -preset fast -crf 18 -pix_fmt yuv420p -an "${out}"`); } return `media/${name}`; };
const audioFile = (file) => { const name = basename(file); const src = file.startsWith("/") ? file : `${V}/${file}`; if (!existsSync(`${V}/public/audio/${name}`)) copyFileSync(src, `${V}/public/audio/${name}`); return `audio/${name}`; };
const s = (ms) => ms / 1000;
const mark = (scene, name) => { const m = ev[scene].events.find((e) => e.type === "mark" && e.name === name); if (!m) throw new Error(`no mark ${scene}/${name}`); return s(m.t); };
/** One of Biscuit's lines from a scene, as the clip fetched when he said it. */
const clip = (scene, re) => { const a = ev[scene].audio.find((c) => re.test(c.text)); if (!a) throw new Error(`no clip ${scene} ${re}`); return { file: audioFile(a.file), ms: a.ms, text: a.text }; };
const GAP = 0.15;
// shots overlap by the crossfade
const XF = 0.4;
mkdirSync(`${V}/public/media/broll`, { recursive: true });
/** A scene picture beside the phone, copied under public/. */
const pic = (name) => { const out = `${V}/public/media/broll/${name}.jpg`; if (!existsSync(out)) copyFileSync(`${V}/assets/broll/${name}.jpg`, out); return `media/broll/${name}.jpg`; };

const segs = []; const track = []; let T = 0;
/** Adds a segment; `audio` items are placed in order, each after the previous one ends (never overlapping), from their own `at` at the earliest. */
function seg(g) {
  const start = T; let end = 0;
  for (const a of g.audio || []) { a.at = Math.max(a.at ?? 0, end); end = a.at + a.ms / 1000 + GAP; }
  g.dur = g.dur ?? (g.to != null ? g.to - g.from : end + 0.3);
  if (g.from != null && g.to == null) g.to = g.from + g.dur;
  g.start = start; segs.push(g); T += g.dur - XF; return start;
}
/** The narrator, at an absolute time; returns when the line ends. */
let voEnd = 0;
function narrate(key, at) { const n = vo[key]; at = Math.max(at, voEnd + GAP); track.push({ at, file: audioFile(n.file), ms: n.ms, text: n.text }); voEnd = at + n.ms / 1000; return voEnd; }
const title = (at, dur, text) => ({ at, dur, text, who: "title" });
const rosa = (at, text) => ({ at, dur: 3.2, text, who: "rosa" });

// 1 the hook: the bill, the numbers, the stakes
{ const t = seg({ kind: "hook", dur: vo["vo-hook"].ms / 1000 + 0.6, image: "media/bill.png", scenes: [{ at: 4.9, dur: 5.8, src: pic("rosa-portrait") }], kinetic: [{ at: 0.9, dur: 4.2, text: "$1,234.50", sub: "Massachusetts General Hospital" }, { at: 5.3, dur: 5.2, text: "Rosa, 78.", sub: "Lives alone. Can't read it." }, { at: 10.7, dur: 5.5, text: "She may owe nothing.", sub: "Nobody told her." }] });
  narrate("vo-hook", t + 0.4); }
// 2 the title
{ const t = seg({ kind: "card", dur: 2.1, title: "Biscuit", subtitle: "by Kindred AI", lines: [] }); narrate("vo-title", t + 0.15); }
// 3 who: Ana's setup, then Rosa's four steps, under the founder's introduction
{ const sc = "ana-setup"; const t = seg({ kind: "laptop", video: media(videosOf(sc)[0]), from: 0.6, dur: 6.8, captions: [title(0.3, 6.3, "Ana, Rosa's daughter, sets Biscuit up from her laptop.")] });
  const endWho = narrate("vo-who", t + 0.2);
  const sr = "rosa-setup", from = mark(sr, "code-screen") - 0.3;
  const steps = [["code-screen", "Rosa types the code."], ["voice", "Says hello."], ["consent", "Her yes, read aloud."], ["help-setup", "Help, set up."], ["done", "Ready."]];
  const dur = endWho + 0.3 - T;
  const caps = steps.map(([m, text], i) => { const at = mark(sr, m) - from; const next = steps[i + 1] ? mark(sr, steps[i + 1][0]) - from : dur; return title(at, Math.max(1, Math.min(3, next - at - 0.15)), text); });
  seg({ kind: "phone", video: media(videosOf(sr)[0]), from, dur, scene: pic("rosa-home"), captions: caps, callouts: [{ at: 0.4, dur: 5, text: "Four steps, once" }] }); }
// 4 the mail: the chime
{ const sc = "rosa-loop"; const from = mark(sc, "mail") - 0.3; const t = seg({ kind: "phone", video: media(videosOf(sc)[0]), from, to: mark(sc, "camera"), scene: pic("mailbox"), audio: [{ at: vo["vo-mail-a"].ms / 1000 + 0.35, ...clip(sc, /^Woof/) }], captions: [], push: [{ at: 1.2, dur: 5.2, x: 195, y: 160, scale: 1.4 }], callouts: [{ at: 0.5, dur: 5.5, text: "The mailbox phone saw the carrier" }] });
  narrate("vo-mail-a", t + 0.2);
  const g = segs[segs.length - 1]; g.captions.push(rosa(g.audio[0].at + g.audio[0].ms / 1000 + 0.3, "yes")); }
// 5 the picture
{ const sc = "rosa-loop"; const from = mark(sc, "camera") - 0.1; const t = seg({ kind: "phone", video: media(videosOf(sc)[0]), from, dur: vo["vo-mail-b"].ms / 1000 + 0.9, scene: pic("rosa-letter"), drift: -1, push: [{ at: 0.8, dur: 4.2, x: 195, y: 300, scale: 1.3 }], callouts: [{ at: 0.5, dur: 4.5, text: "A whole letter in the frame" }] });
  narrate("vo-mail-b", t + 0.3); }
// 6 the reading: his verdict, then the fields, pushed in on a second pass while the narrator speaks
{ const sc = "rosa-loop"; const r = mark(sc, "reading"); const bill = clip(sc, /^This is a bill/);
  const t = seg({ kind: "phone", video: media(videosOf(sc)[0]), from: r - 0.6, dur: 6.5, scene: pic("hospital-bill"), audio: [{ at: 0.75, ...bill }], callouts: [{ at: 3.6, dur: 4.2, text: "Every number comes from the page" }] });
  const endRead = narrate("vo-read", t + 0.75 + bill.ms / 1000 + GAP);
  seg({ kind: "phone", video: media(videosOf(sc)[0]), from: r + 1.6, dur: endRead + 0.35 - T, scene: pic("rosa-home"), drift: -1, push: [{ at: 0.3, dur: 3.8, x: 195, y: 430, scale: 1.35 }], callouts: [{ at: 0.4, dur: 3.6, text: "She can change any line" }] }); }
// 7 the questions, in two shots so the waits are cut
{ const sc = "rosa-loop"; const q = mark(sc, "questions");
  const t = seg({ kind: "phone", video: media(videosOf(sc)[0]), from: q - 0.2, dur: 11.0, scene: pic("rosa-talking"), audio: [{ at: vo["vo-q-a"].ms / 1000 + 0.35, ...clip(sc, /^Is this the first bill/) }], callouts: [{ at: 0.4, dur: 4, text: "By voice, on the phone" }] });
  narrate("vo-q-a", t + 0.2);
  const g1 = segs[segs.length - 1]; g1.captions = [rosa(g1.audio[0].at + g1.audio[0].ms / 1000 + 0.4, "not sure")]; T -= g1.dur; g1.dur = g1.captions[0].at + 1.6; g1.to = g1.from + g1.dur; T += g1.dur;
  const r2 = ev[sc].events.filter((e) => e.type === "rosa")[2]; // her "yes" to the second question
  const t2 = seg({ kind: "phone", video: media(videosOf(sc)[0]), from: s(r2.t) - 9.9, dur: 8.0, scene: pic("rosa-talking"), drift: -1, audio: [{ at: 0.7, ...clip(sc, /^Did you already pay/) }], captions: [] });
  const g2 = segs[segs.length - 1]; const yesAt = g2.audio[0].at + g2.audio[0].ms / 1000 + 0.5; g2.captions.push(rosa(yesAt, "yes"));
  narrate("vo-q-b", t2 + yesAt + 0.4); }
// 8 the hand-off: the narrator, then Biscuit's offer, her tap, Sent
{ const sc = "rosa-loop"; const from = mark(sc, "offer") - 0.6; const sent = mark(sc, "sent");
  const t = seg({ kind: "phone", video: media(videosOf(sc)[0]), from, to: sent + 0.9, scene: pic("hospital-bill"), drift: -1, audio: [{ at: vo["vo-rule"].ms / 1000 + 0.35, ...clip(sc, /^Massachusetts General/) }, { ...clip(sc, /^I can start the application/) }, { ...clip(sc, /^Done! Ana/) }], captions: [], push: [{ at: 8.0, dur: 5.5, x: 195, y: 250, scale: 1.3 }, { at: sent - from + 0.2, dur: 1.6, x: 300, y: 330, scale: 1.3 }], callouts: [{ at: 1.0, dur: 5.5, text: "The hospital's own rule" }] });
  narrate("vo-rule", t + 0.2);
  const g = segs[segs.length - 1]; const done = g.audio[2]; done.at = Math.max(done.at, g.audio[1].at + g.audio[1].ms / 1000 + 1.0); g.captions.push(title(done.at - 0.9, 3.4, "She taps: Yes, Start It with Ana."));
  const want = Math.max(done.at + done.ms / 1000 + 0.8, sent - from + 0.5); T -= g.dur; g.dur = Math.min(g.dur, want); g.to = g.from + g.dur; T += g.dur; }
// 9 Ana: her page, the day, the application, the family's break
{ const sc = "ana-page"; const vids = videosOf(sc); const fam = mark(sc, "family");
  const t = seg({ kind: "laptop", video: media(vids[0]), from: fam - 1.5, dur: 6.5, captions: [title(0.3, 6, "Welcome, Ana, with Rosa.")] });
  const endAna = narrate("vo-ana", t + 0.2);
  seg({ kind: "laptop", video: media(vids[0]), from: fam + 5.0, dur: 4.0, push: [{ at: 0.2, dur: 3.6, x: 1300, y: 660, scale: 1.5 }], captions: [title(0.3, 3.6, "Needs You: one button starts the application.")] });
  seg({ kind: "laptop", video: media(vids[1]), from: 0.4, dur: 3.6, captions: [title(0.2, 3.3, "Kindred · the application, under the hospital's own rule")] });
  seg({ kind: "laptop", video: media(vids[2]), from: 5.0, dur: Math.max(3.6, endAna + 0.3 - T), captions: [title(0.2, 3.6, "Kindred · the family's break")] }); }
// 10 the rest of the day, in three shots
{ const sc = "rosa-companion"; const v = media(videosOf(sc)[0]); const home = mark(sc, "home");
  const ta = seg({ kind: "phone", video: v, from: home - 0.4, dur: vo["vo-day-a"].ms / 1000 + 0.6, scene: pic("rosa-evening"), captions: [rosa(vo["vo-day-a"].ms / 1000 - 1.2, "Biscuit, remind me about my pills at eight.")], callouts: [{ at: 0.3, dur: 3.2, text: "Just talk to him" }] });
  narrate("vo-day-a", ta + 0.2);
  const chime = clip(sc, /^I will chime/); const t = seg({ kind: "phone", video: v, from: home + 6.0, dur: 10.6, scene: pic("rosa-evening"), drift: -1, audio: [{ at: 0.4, ...chime }], callouts: [{ at: mark(sc, "settings") - home - 6.0 + 0.3, dur: 2.5, text: "The reminder, kept" }, { at: mark(sc, "pause") - home - 6.0 + 0.2, dur: 2.2, text: "Pause: he stops listening" }] });
  narrate("vo-day-b", t + 5.0); // "she holds one button" lands as the hold begins
  const hold = mark(sc, "hold"); const help = mark(sc, "help") - hold + 0.6; seg({ kind: "phone", video: v, from: hold - 0.6, dur: help + 2.9, scene: pic("ana-laptop"), audio: [{ at: help + 0.6, ...clip(sc, /^Ana knows/) }], callouts: [{ at: 0.3, dur: 2.4, text: "Help: hold two seconds" }, { at: help + 0.4, dur: 2.4, text: "Ana's phone buzzed" }] }); }
// 11 behind the scenes
{ const t = seg({ kind: "meta", dur: vo["vo-meta"].ms / 1000 + 0.4, rows: [["SAM 3.1", "watches the mailbox and checks the frame"], ["Muse Spark 1.3", "reads the bill and talks with Rosa"], ["Muse Voice Transcribe", "hears her"]] }); narrate("vo-meta", t + 0.3); }
// 12 the payoff
{ const t = seg({ kind: "payoff", dur: vo["vo-close"].ms / 1000 + 2.2, image: "media/bill.png", backdrop: pic("family") }); narrate("vo-close", t + 0.4); }

const total = Math.max(...segs.map((g) => g.start + g.dur));
writeFileSync(`${V}/public/timeline.json`, JSON.stringify({ fps: 30, vo: track, segments: segs }, null, 1));
for (const [i, g] of segs.entries()) console.log(`${String(i + 1).padStart(2)}. ${g.kind.padEnd(7)} at ${g.start.toFixed(1).padStart(6)}  ${g.dur.toFixed(1)}s  audio=${g.audio?.length || 0}${g.scene ? "  " + g.scene.split("/").pop() : ""}`);
console.log(`total ${total.toFixed(1)} s`);
for (const n of track) console.log(`vo ${n.at.toFixed(1)}-${(n.at + n.ms / 1000).toFixed(1)} ${n.text.slice(0, 40)}`);
