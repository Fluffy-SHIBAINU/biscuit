/** A WAV with 32-bit float samples (what Kokoro's truss writes) becomes 16-bit PCM, which every phone plays; any other buffer passes through unchanged. */
export function toPcm16Wav(buf: Buffer): Buffer {
  if (buf.length < 44 || buf.toString("ascii", 0, 4) !== "RIFF" || buf.toString("ascii", 8, 12) !== "WAVE") return buf;
  // Walk the chunks: fmt tells the format, data holds the samples.
  let off = 12, fmt: { tag: number; channels: number; rate: number; bits: number } | null = null, data: { start: number; len: number } | null = null;
  while (off + 8 <= buf.length) {
    const id = buf.toString("ascii", off, off + 4), len = buf.readUInt32LE(off + 4);
    if (id === "fmt ") fmt = { tag: buf.readUInt16LE(off + 8), channels: buf.readUInt16LE(off + 10), rate: buf.readUInt32LE(off + 12), bits: buf.readUInt16LE(off + 22) };
    if (id === "data") { data = { start: off + 8, len: Math.min(len, buf.length - off - 8) }; break; }
    off += 8 + len + (len % 2);
  }
  if (!fmt || !data || fmt.tag !== 3 || fmt.bits !== 32) return buf;
  const n = Math.floor(data.len / 4);
  const pcm = Buffer.alloc(n * 2);
  for (let i = 0; i < n; i++) {
    const v = Math.max(-1, Math.min(1, buf.readFloatLE(data.start + i * 4)));
    pcm.writeInt16LE(Math.trunc(v < 0 ? v * 32768 : v * 32767), i * 2);
  }
  const h = Buffer.alloc(44);
  h.write("RIFF", 0); h.writeUInt32LE(36 + pcm.length, 4); h.write("WAVE", 8); h.write("fmt ", 12); h.writeUInt32LE(16, 16);
  h.writeUInt16LE(1, 20); h.writeUInt16LE(fmt.channels, 22); h.writeUInt32LE(fmt.rate, 24); h.writeUInt32LE(fmt.rate * fmt.channels * 2, 28); h.writeUInt16LE(fmt.channels * 2, 32); h.writeUInt16LE(16, 34);
  h.write("data", 36); h.writeUInt32LE(pcm.length, 40);
  return Buffer.concat([h, pcm]);
}
