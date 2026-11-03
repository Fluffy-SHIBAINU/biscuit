// Renders one narration line in several Gemini voices so the founder can pick the narrator. Writes audio/sample-<voice>.wav.
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
const env = Object.fromEntries(readFileSync("/Users/grey/Desktop/dev/biscuit/.env.local", "utf8").split("\n").filter((l) => /^[A-Z_]+=/.test(l)).map((l) => { const i = l.indexOf("="); return [l.slice(0, i), l.slice(i + 1).trim().replace(/^"|"$/g, "")]; }));
const key = env.GEMINI_API_KEY; if (!key) { console.error("no GEMINI_API_KEY"); process.exit(1); }
const MODEL = "gemini-3.8-flash-tts";
const LINE = process.argv[2] || "This is a hospital bill for one thousand, two hundred and thirty-four dollars. It went to Rosa. She's seventy-eight, she lives alone, and she can't read it. Under the hospital's own policy, she may owe nothing. Nobody told her.";
const VOICES = (process.argv[3] || "Charon,Orus,Iapetus,Sadaltager,Achird,Gacrux,Sulafat,Kore").split(",");
mkdirSync("audio", { recursive: true });
for (const voice of VOICES) {
  const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`, { method: "POST", headers: { "content-type": "application/json", "x-goog-api-key": key }, body: JSON.stringify({ contents: [{ parts: [{ text: LINE }] }], generationConfig: { responseModalities: ["AUDIO"], speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: voice } } } } }) });
  if (!res.ok) { console.log(voice, "failed", res.status, (await res.text()).slice(0, 120)); continue; }
  const json = await res.json();
  const part = json?.candidates?.[0]?.content?.parts?.find((p) => p?.inlineData?.data);
  if (!part) { console.log(voice, "no audio"); continue; }
  writeFileSync(`audio/sample-${voice}.wav`, Buffer.from(part.inlineData.data, "base64"));
  console.log(voice, "ok");
}
