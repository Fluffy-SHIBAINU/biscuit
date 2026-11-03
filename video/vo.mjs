// The narrator's lines (Gemini text-to-speech, voice Sadaltager), one WAV each in audio/, durations in vo.json.
//   node vo.mjs            renders every line not yet on disk
//   node vo.mjs --force    renders them all again
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
const env = Object.fromEntries(readFileSync("/Users/grey/Desktop/dev/biscuit/.env.local", "utf8").split("\n").filter((l) => /^[A-Z_]+=/.test(l)).map((l) => { const i = l.indexOf("="); return [l.slice(0, i), l.slice(i + 1).trim().replace(/^"|"$/g, "")]; }));
const key = env.GEMINI_API_KEY; if (!key) { console.error("no GEMINI_API_KEY"); process.exit(1); }
const MODEL = "gemini-3.8-flash-tts", VOICE = process.env.VO_VOICE || "Sadaltager";
export const LINES = {
  "vo-hook": "This is a hospital bill for one thousand, two hundred and thirty-four dollars. It went to Rosa. She's seventy-eight, she lives alone, and she can't read it. Under the hospital's own policy, she may owe nothing. Nobody told her.",
  "vo-title": "This is Biscuit.",
  "vo-who": "I'm Shawn, founder of Kindred AI. We build AI agents that save families from healthcare bills. Our products already save people from paying bills they don't owe. To help seniors, we built a special agent called Biscuit. Biscuit helps an older person understand the mail and the bills that come to the house, and works with the rest of our Kindred agents. Let me show you how it works.",
  "vo-mail-a": "Biscuit watches the mailbox. A spare phone, or a camera, on the windowsill is enough. When mail comes, he tells Rosa there may be a bill to look at.",
  "vo-mail-b": "She holds the letter up, he takes the picture, and her daughter Ana will see whatever he reads.",
  "vo-read": "Biscuit reads the bill and tells Rosa what it says. She checks that he read it right, and changes anything he got wrong, before Ana sees it.",
  "vo-q-a": "Then Biscuit asks Rosa a few questions and works it out with her.",
  "vo-q-b": "From her answers, he decides whether Kindred should take a look.",
  "vo-rule": "When there's a way Kindred can save money, Biscuit passes the bill to Ana, and Ana can start the process.",
  "vo-ana": "Across town, Ana's page updates the same minute: the bill, in Rosa's own words, and a mark on the day it's due. She gets a notification, and one button to start the Kindred application, ready to go. And because Ana is a caregiver now, Kindred shows her the help she's owed, too.",
  "vo-day": "The rest of the day, Biscuit is company. A reminder, just by asking. Quiet when she wants it. And if she ever needs help, she holds one button, and Ana knows.",
  "vo-meta": "Behind the scenes, Meta's AI models do the work: watching the mailbox, reading the bill, hearing Rosa, and passing everything between Biscuit, Rosa, Ana, and Kindred. Meta AI powers this elder-care agent.",
  "vo-payoff": "Rosa may owe nothing. Now someone told her.",
};
const wavMs = (buf) => { let i = 12; while (i < buf.length - 8) { const id = buf.toString("ascii", i, i + 4), sz = buf.readUInt32LE(i + 4); if (id === "data") { const rate = buf.readUInt32LE(24) || 24000, block = buf.readUInt16LE(32) || 2; return Math.round(sz / (rate * block) * 1000); } i += 8 + sz; } return 0; };
mkdirSync("audio", { recursive: true });
const out = {};
for (const [k, text] of Object.entries(LINES)) {
  const file = `audio/${k}.wav`;
  if (!existsSync(file) || process.argv.includes("--force")) {
    const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`, { method: "POST", headers: { "content-type": "application/json", "x-goog-api-key": key }, body: JSON.stringify({ contents: [{ parts: [{ text }] }], generationConfig: { responseModalities: ["AUDIO"], speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: VOICE } } } } }) });
    if (!res.ok) { console.log(k, "failed", res.status); continue; }
    const part = (await res.json())?.candidates?.[0]?.content?.parts?.find((p) => p?.inlineData?.data);
    if (!part) { console.log(k, "no audio"); continue; }
    writeFileSync(file, Buffer.from(part.inlineData.data, "base64"));
  }
  out[k] = { text, file, ms: wavMs(readFileSync(file)) };
  console.log(k, out[k].ms, "ms");
}
writeFileSync("vo.json", JSON.stringify(out, null, 1));
