// The scene pictures beside the phone: Gemini image generation (gemini-3.1-flash-image) through the Gemini key; the
// portrait is made first and shown to the model for every later scene with Rosa, so she stays the same woman, one PNG each in assets/broll/. A picture already
// on disk is kept; `node broll.mjs --force` makes them all again.
import { readFileSync, writeFileSync, existsSync } from "node:fs";
const env = Object.fromEntries(readFileSync("/Users/grey/Desktop/dev/biscuit/.env.local", "utf8").split("\n").filter((l) => /^[A-Z_]+=/.test(l)).map((l) => { const i = l.indexOf("="); return [l.slice(0, i), l.slice(i + 1).trim().replace(/^"|"$/g, "")]; }));
const key = env.GEMINI_API_KEY; if (!key) { console.error("no GEMINI_API_KEY"); process.exit(1); }
const ROSA = "a 78-year-old woman with silver hair in a loose bun, round glasses and a soft knitted cardigan";
const ANA = "her daughter, a woman in her early forties with dark hair tied back, in a sweater";
const STYLE = "photorealistic, cinematic film still, 35mm lens, shallow depth of field, natural light, muted warm palette, no text, no words, no letters, no logos";
export const SCENES = {
  "rosa-portrait": { ar: "16:9", prompt: `Close portrait of ${ROSA}, sitting at her kitchen table by a window in soft morning light, looking down at an envelope in her hands with a worried, tired expression, ${STYLE}` },
  "rosa-home": { ar: "4:3", prompt: `${ROSA} alone in a small, tidy kitchen in the morning, a cup of tea and a stack of unopened mail on the table, light through lace curtains, ${STYLE}` },
  "mailbox": { ar: "4:3", prompt: `An old smartphone propped on a windowsill inside a house, pointing out through the glass at a curbside mailbox on a quiet suburban street, a mail carrier walking up with letters, morning light, ${STYLE}` },
  "rosa-letter": { ar: "4:3", prompt: `${ROSA} holding a paper letter up in front of a smartphone that stands propped on her kitchen table, the phone's camera facing the letter, seen from the side, ${STYLE}` },
  "rosa-talking": { ar: "4:3", prompt: `${ROSA} leaning toward a smartphone propped on her kitchen table, speaking to it with a small smile, one hand on her teacup, ${STYLE}` },
  "hospital-bill": { ar: "4:3", prompt: `A hospital bill lying on a wooden kitchen table beside reading glasses and a cooling cup of tea, late afternoon light raking across the paper, no readable text on the paper, ${STYLE}` },
  "ana-laptop": { ar: "4:3", prompt: `${ANA} at a laptop at a desk in a small home office in the evening, lamp light, looking at the screen with quiet relief, a phone face up beside the laptop, ${STYLE}` },
  "rosa-evening": { ar: "4:3", prompt: `${ROSA} in an armchair in the evening with a blanket, a weekly pill organizer and a smartphone on the side table under a warm lamp, ${STYLE}` },
  "family": { ar: "16:9", prompt: `${ROSA} and ${ANA} together at the kitchen table, laughing over tea, the mother's hand on her daughter's, afternoon light, ${STYLE}` },
};
const MODEL = "gemini-3.1-flash-image";
const only = process.argv.filter((a) => !a.startsWith("--") && !a.endsWith(".mjs") && !a.includes("/node"));
const order = ["rosa-portrait", ...Object.keys(SCENES).filter((k) => k !== "rosa-portrait")];
for (const name of order) {
  const { ar, prompt } = SCENES[name];
  if (only.length && !only.includes(name)) continue;
  const file = `assets/broll/${name}.jpg`;
  if (existsSync(file) && !process.argv.includes("--force")) { console.log(name, "kept"); continue; }
  const parts = [];
  if (name !== "rosa-portrait" && prompt.includes("78-year-old") && existsSync("assets/broll/rosa-portrait.jpg")) parts.push({ inlineData: { mimeType: "image/jpeg", data: readFileSync("assets/broll/rosa-portrait.jpg").toString("base64") } }, { text: "The woman in this picture is Rosa; keep her face, hair, glasses and cardigan the same in the new picture." });
  parts.push({ text: prompt });
  const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`, { method: "POST", headers: { "content-type": "application/json", "x-goog-api-key": key }, body: JSON.stringify({ contents: [{ parts }], generationConfig: { responseModalities: ["IMAGE"], imageConfig: { aspectRatio: ar } } }) });
  if (!res.ok) { console.log(name, "failed", res.status, (await res.text()).slice(0, 300)); continue; }
  const json = await res.json(); const part = json?.candidates?.[0]?.content?.parts?.find((p) => p?.inlineData?.data);
  if (!part) { console.log(name, "no image", JSON.stringify(json).slice(0, 300)); continue; }
  writeFileSync(file, Buffer.from(part.inlineData.data, "base64")); console.log(name, "ok", part.inlineData.mimeType);
}
