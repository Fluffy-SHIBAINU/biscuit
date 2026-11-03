// Records the demo's scenes: Chromium as an iPhone against production for Rosa, as a laptop against the local server for
// Ana. Each scene is its own video in raw/; events.json holds, per scene, every line Biscuit said (with his audio fetched
// from the speak route and the moment it started playing), every line Rosa "said" through the ear hook, and the marks.
//   node record.mjs [scene...]   scenes: ana-setup rosa-setup rosa-loop rosa-companion ana-page
import { chromium } from "playwright";
import { mkdirSync, writeFileSync, readFileSync, existsSync } from "node:fs";

const PROD = "https://biscuit.kindred-ai.dev";
const LOCAL = "http://localhost:5174";
const RAW = "raw"; mkdirSync(RAW, { recursive: true }); mkdirSync("audio", { recursive: true });
const ARGS = ["--autoplay-policy=no-user-gesture-required"];
// The camera is a canvas showing the bill (Chromium's fake devices hang under automation on this Mac); there is no microphone.
const BILL = "data:image/png;base64," + readFileSync("assets/bill.png").toString("base64");
const state = existsSync("state.json") ? JSON.parse(readFileSync("state.json", "utf8")) : {};
const save = () => writeFileSync("state.json", JSON.stringify(state, null, 1));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const wavMs = (buf) => { let i = 12; while (i < buf.length - 8) { const id = buf.toString("ascii", i, i + 4), sz = buf.readUInt32LE(i + 4); if (id === "data") return Math.round(sz / (buf.readUInt32LE(28) || 48000) * 1000); i += 8 + sz; } return 0; };

async function scene(name, { phone, base }, run) {
  const browser = await chromium.launch({ args: ARGS });
  const ctx = await browser.newContext({
    ...(phone ? { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1" } : { viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 }),
    recordVideo: { dir: `${RAW}/${name}-${Date.now()}`, size: phone ? { width: 780, height: 1688 } : { width: 1440, height: 900 } },
    permissions: ["camera", "microphone"],
  });
  const events = []; let t0 = 0;
  const log = (type, data = {}) => { events.push({ t: Date.now() - t0, type, ...data }); process.stdout.write(`  ${name} ${((Date.now() - t0) / 1000).toFixed(1)}s ${type} ${data.text || data.name || ""}\n`); };
  // the moment each of his clips starts: a hook on the context's player, logged from the page
  await ctx.addInitScript((bill) => {
    // the camera is a canvas showing the bill; there is no microphone
    navigator.mediaDevices.getUserMedia = async (c) => {
      try {
        if (!c?.video) throw new DOMException("no microphone", "NotAllowedError");
        const img = new Image(); img.src = bill; await img.decode();
        const cv = document.createElement("canvas"); cv.width = 1280; cv.height = 960; const g = cv.getContext("2d");
        const draw = () => { g.drawImage(img, 0, 0, 1280, 960); requestAnimationFrame(draw); }; draw();
        console.log("CAM_OK");
        return cv.captureStream(15);
      } catch (e) { console.log("CAM_ERR " + (e?.name || "") + " " + (e?.message || e)); throw e; }
    };
    // the moment each of his clips starts
    const S = AudioBufferSourceNode.prototype.start; AudioBufferSourceNode.prototype.start = function () { try { console.log("BISCUIT_PLAY " + (this.buffer ? this.buffer.duration : 0)); } catch {} return S.apply(this, arguments); };
  }, BILL);
  const page = await ctx.newPage();
  t0 = Date.now();
  let lastLine = ""; const audioJobs = [];
  // every line that goes to the speak route, seen at the request; every screen change; the camera page's own words
  page.on("request", (r) => { try { if (r.url().includes("/api/biscuit/speak") && r.method() === "POST") { const text = JSON.parse(r.postData() || "{}").text; if (text) { log("line", { text }); if (state.token) audioJobs.push(fetchLine(text)); } } } catch {} });
  page.on("framenavigated", (f) => { if (f === page.mainFrame()) log("nav", { text: f.url().replace(/^https?:\/\/[^/]+/, "") }); });
  let lastStatus = "";
  const statusPoll = setInterval(async () => { try { const t = await page.evaluate(() => document.querySelector(".card.status .lead")?.textContent || ""); if (t && t !== lastStatus) { lastStatus = t; log("status", { text: t }); } } catch {} }, 500);
  page.on("console", (m) => { const s = m.text(); if (s.startsWith("CAM_")) log("cam", { text: s }); if (s.startsWith("BISCUIT_PLAY ")) log("play", { duration: Number(s.slice(13)) }); });
  // every line Biscuit says: logged when it appears, its audio fetched from the speak route with Rosa's token
  // Rosa speaks only when he is not talking: words said while he talks are his, and dropped
  const untilListening = async (ms = 40000) => { const t = Date.now(); while (Date.now() - t < ms) { const free = await page.evaluate(() => typeof window.biscuitMuted === "function" && !window.biscuitMuted()).catch(() => false); if (free) return true; await sleep(150); } return false; };
  // Rosa's phone, linked: the token from setup, the ear in scripted mode (no microphone here; words come through the hook)
  const prime = async () => { await page.goto(`${PROD}/`); await page.evaluate((tok) => { const s = JSON.parse(localStorage.getItem("biscuit") || "{}"); Object.assign(s, { deviceToken: tok, kind: "rosa", household: s.household || { called: "Rosa" }, consentedAt: s.consentedAt || new Date().toISOString(), earAllowedAt: new Date().toISOString(), earMode: "scripted", earPaused: false, muted: false }); localStorage.setItem("biscuit", JSON.stringify(s)); }, state.token); await page.goto(`${PROD}/`); await sleep(5000); await untilListening(); await sleep(800); };
  const poll = setInterval(() => {}, 100000);
  // a line of his, once the page has asked the speak route for it
  const untilLine = async (re, ms = 25000) => { const t = Date.now(); while (Date.now() - t < ms) { if (events.some((e) => e.type === "line" && re.test(e.text || ""))) return true; await sleep(150); } return false; };
  const api = { page, log, sleep, untilListening, untilLine, prime, say: async (text) => { await untilListening(); await sleep(600); log("rosa", { text }); await page.evaluate((t) => window.biscuitHear(t), text); }, mark: (n) => log("mark", { name: n }), tap: async (sel) => { await page.locator(sel).first().click(); } };
  try { await run(api); } catch (err) { log("error", { text: String(err?.message || err).slice(0, 200) }); }
  clearInterval(poll); clearInterval(statusPoll);
  await sleep(500);
  await ctx.close(); await browser.close();
  const audio = await Promise.all(audioJobs);
  const all = existsSync("events.json") ? JSON.parse(readFileSync("events.json", "utf8")) : {};
  all[name] = { events, audio: audio.filter(Boolean), base, video: await page.video()?.path().catch(() => null) };
  writeFileSync("events.json", JSON.stringify(all, null, 1));
  console.log(`${name}: ${events.length} events, ${audio.filter(Boolean).length} clips`);
}
const clipName = (text) => "audio/" + text.toLowerCase().replace(/[^a-z0-9]+/g, "-").slice(0, 60) + ".wav";
async function fetchLine(text) {
  const file = clipName(text);
  if (!existsSync(file)) {
    const res = await fetch(`${PROD}/api/biscuit/speak`, { method: "POST", headers: { authorization: `Bearer ${state.token}`, "content-type": "application/json" }, body: JSON.stringify({ text }) });
    if (!res.ok) return null;
    writeFileSync(file, Buffer.from(await res.arrayBuffer()));
  }
  return { text, file, ms: wavMs(readFileSync(file)) };
}
const waitText = (page, text, ms = 30000) => page.getByText(text, { exact: false }).first().waitFor({ timeout: ms });

const SCENES = {
  // Ana, on a laptop: who Biscuit helps, then the code for Rosa's phone
  "ana-setup": () => scene("ana-setup", { phone: false, base: LOCAL }, async ({ page, mark, sleep }) => {
    // the household from an earlier run is simply filled in again: Who Biscuit Helps updates it
    await page.goto(`${LOCAL}/ana/new`); await sleep(1200); mark("who");
    await page.getByPlaceholder("Rosa Alvarez").fill("Rosa Alvarez"); await sleep(400);
    await page.getByPlaceholder("Rosa", { exact: true }).fill("Rosa"); await sleep(800);
    await page.getByRole("button", { name: "Next" }).click();
    await page.locator(".codebox").waitFor({ timeout: 20000 });
    await page.waitForFunction(() => /\d{3} \d{3}/.test(document.querySelector(".codebox")?.textContent || ""));
    state.code = (await page.locator(".codebox").textContent()).replace(/\D/g, ""); save(); mark("code");
    await sleep(4000);
  }),
  // Rosa's phone: the code, three steps, hello
  "rosa-setup": () => scene("rosa-setup", { phone: true, base: PROD }, async ({ page, mark, sleep }) => {
    await page.goto(`${PROD}/`); await sleep(1500); mark("code-screen");
    const input = page.locator("input.code"); await input.click(); for (const ch of state.code) { await page.keyboard.type(ch); await sleep(140); }
    await sleep(500); await page.getByRole("button", { name: "Link" }).click();
    await waitText(page, "Say: Hello Biscuit"); mark("voice"); await sleep(1800);
    await page.getByRole("button", { name: "Skip" }).click();
    await waitText(page, "Biscuit Reads This Aloud"); mark("consent"); await sleep(2500);
    await page.getByRole("button", { name: "Yes, Go On" }).click();
    await waitText(page, "If Rosa Needs Help"); mark("help-setup"); await sleep(2000);
    await page.getByRole("button", { name: "Skip for Now" }).click();
    await waitText(page, "Biscuit Is Ready"); mark("done"); await sleep(1500);
    state.token = await page.evaluate(() => JSON.parse(localStorage.getItem("biscuit") || "{}").deviceToken); save();
    // the recorder has no microphone of its own: Biscuit's ear takes the capture path with a silent fake device
    await page.evaluate(() => { const s = JSON.parse(localStorage.getItem("biscuit") || "{}"); s.earMode = "scripted"; s.earAllowedAt = new Date().toISOString(); localStorage.setItem("biscuit", JSON.stringify(s)); });
    await page.getByRole("button", { name: "Let Biscuit Say Hello" }).click();
    await sleep(6000); mark("home");
  }),
  // the loop: the chime, the letter, the reading, the questions, the offer, sent
  "rosa-loop": () => scene("rosa-loop", { phone: true, base: PROD }, async ({ page, mark, sleep, say, prime, untilLine, untilListening }) => {
    await prime(); mark("home");
    await page.goto(`${PROD}/mail?from=home`); mark("mail"); await sleep(4500);
    await say("yes"); await sleep(1500);
    await page.waitForURL(/\/letter/, { timeout: 15000 }); mark("camera");
    // the frame check decides by itself; if it has not by twelve seconds, Rosa taps Take the Picture
    try { await page.waitForURL(/\/reading/, { timeout: 25000 }); } catch { if (/\/letter/.test(page.url())) { mark("tap-picture"); await page.getByRole("button", { name: "Take the Picture" }).click({ timeout: 4000 }).catch(() => {}); } }
    await page.waitForURL(/\/reading/, { timeout: 90000 }); mark("reading"); await sleep(5000);
    await page.locator("input.field").first().scrollIntoViewIfNeeded(); await sleep(1500);
    await page.getByRole("button", { name: "Next" }).click(); mark("questions");
    for (let i = 0; i < 6; i++) {
      await sleep(2500);
      if (!/\/question/.test(page.url())) break;
      const t = await page.locator("h1").textContent();
      if (/No questions|One moment/.test(t || "")) { await sleep(2000); continue; }
      await say(i === 1 ? "not sure" : "yes"); await sleep(2500);
    }
    await page.waitForURL(/\/offer|\/docket/, { timeout: 30000 }); mark("offer");
    // he says the rule, then asks; Rosa answers only after the question is out
    await untilLine(/Shall I/, 25000); await sleep(1500); await untilListening(); await sleep(900);
    const btn = page.getByRole("button", { name: /Yes, Start It with Ana|Send It to Ana/ });
    if (await btn.count()) { await btn.first().click(); }
    await page.waitForURL(/\/docket/, { timeout: 30000 }); mark("sent"); await sleep(6000);
  }),
  // a companion, pause, and the Help hold
  "rosa-companion": () => scene("rosa-companion", { phone: true, base: PROD }, async ({ page, mark, sleep, say, prime }) => {
    await prime(); mark("home");
    await say("Biscuit, remind me about my pills at eight."); await sleep(9000);
    await page.goto(`${PROD}/settings`); await sleep(3500); mark("settings");
    await page.goto(`${PROD}/`); await sleep(2000);
    await page.getByRole("button", { name: "Pause" }).click(); mark("pause"); await sleep(2500);
    await page.getByRole("button", { name: "Listen" }).click(); await sleep(2000);
    const help = page.locator("button.hold"); await help.scrollIntoViewIfNeeded(); const b = await help.boundingBox();
    mark("hold"); await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2); await page.mouse.down(); await sleep(2400); await page.mouse.up();
    await page.waitForURL(/\/help/, { timeout: 10000 }); mark("help"); await sleep(5000);
    await page.getByRole("button", { name: "Stop Help" }).click(); await sleep(1500);
  }),
  // Ana's page, the hospital's rule in Waive, the letter passed to Lull
  "ana-page": () => scene("ana-page", { phone: false, base: LOCAL }, async ({ page, mark, sleep }) => {
    await page.goto(`${LOCAL}/ana`); await page.locator(".ana-letter").first().waitFor({ timeout: 30000 }); await sleep(3000); mark("family");
    const due = page.locator(".cal-day:has(.cal-dot)").first(); if (await due.count()) { await due.click(); mark("calendar"); await sleep(2500); }
    const rule = page.getByRole("link", { name: /Hospital's Rule in Waive/ }).first();
    if (await rule.count()) { const href = await rule.getAttribute("href"); mark("waive"); const w = await page.context().newPage(); await w.goto(href); await sleep(6000); await w.close(); }
    await page.bringToFront(); await sleep(1000);
    const lull = page.getByRole("button", { name: "Pass to Lull" }).first();
    if (await lull.count()) { const [popup] = await Promise.all([page.context().waitForEvent("page"), lull.click()]); mark("lull"); await popup.waitForLoadState("domcontentloaded"); await sleep(7000); await popup.close(); }
    await page.bringToFront(); await sleep(2500); mark("recent");
  }),
};
const names = process.argv.slice(2).length ? process.argv.slice(2) : Object.keys(SCENES);
for (const n of names) { if (!SCENES[n]) { console.error("no scene", n); continue; } await SCENES[n](); }
