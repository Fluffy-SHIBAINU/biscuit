// Biscuit's narration lines for the cards, in his own voice through the speak route.
import { readFileSync, writeFileSync, existsSync } from "node:fs";
const state = JSON.parse(readFileSync("/Users/grey/Desktop/dev/biscuit/video/state.json", "utf8"));
const LINES = {
  "narr-why": "Rosa is seventy-eight and lives alone. She gets mail she can't read, and bills she may not owe. Ana lives across town.",
  "narr-setup": "Ana sets me up once. Twenty minutes.",
  "narr-ana": "Ana sees what I read, in Rosa's own words.",
  "narr-chain": "I read. Waive lowers the bill. Lull gets the family its break.",
  "narr-waive": "Waive holds the hospital's own rule, and starts the application.",
  "narr-lull": "Lull gets the family its break.",
  "narr-mailbox": "A spare phone on the sill watches the box. Nothing is recorded.",
  "narr-end": "I'm Biscuit, from Kindred. Ask me to read your mail.",
};
const wavMs = (buf) => { let i = 12; while (i < buf.length - 8) { const id = buf.toString("ascii", i, i + 4), sz = buf.readUInt32LE(i + 4); if (id === "data") return Math.round(sz / (buf.readUInt32LE(28) || 48000) * 1000); i += 8 + sz; } return 0; };
const out = {};
for (const [key, text] of Object.entries(LINES)) {
  const file = `/Users/grey/Desktop/dev/biscuit/video/audio/${key}.wav`;
  if (!existsSync(file)) {
    const res = await fetch("https://biscuit.kindred-ai.dev/api/biscuit/speak", { method: "POST", headers: { authorization: `Bearer ${state.token}`, "content-type": "application/json" }, body: JSON.stringify({ text }) });
    if (!res.ok) { console.log("failed", key, res.status); continue; }
    writeFileSync(file, Buffer.from(await res.arrayBuffer()));
  }
  out[key] = { text, file: `audio/${key}.wav`, ms: wavMs(readFileSync(file)) };
  console.log(key, out[key].ms, "ms");
}
writeFileSync("/Users/grey/Desktop/dev/biscuit/video/narration.json", JSON.stringify(out, null, 1));
