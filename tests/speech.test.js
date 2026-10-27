import { expect, test } from "vitest";
import { isSilent, encodeWav, downsample } from "../src/lib/audio.js";

test("isSilent", () => {
  expect(isSilent(new Float32Array(2048).fill(0.001))).toBe(true);
  expect(isSilent(new Float32Array(2048).fill(0.2))).toBe(false);
});

test("downsample 48k to 16k keeps a third of the samples", () => {
  const out = downsample(new Float32Array(4800).fill(0.5), 48000, 16000);
  expect(out.length).toBe(1600);
  expect(out[0]).toBeCloseTo(0.5);
});

test("encodeWav writes a 16-bit mono RIFF header", () => {
  const buf = encodeWav(new Float32Array([0, 0.5, -0.5, 1]), 16000);
  const v = new DataView(buf);
  expect(String.fromCharCode(...new Uint8Array(buf.slice(0, 4)))).toBe("RIFF");
  expect(String.fromCharCode(...new Uint8Array(buf.slice(8, 12)))).toBe("WAVE");
  expect(v.getUint16(22, true)).toBe(1); // channels
  expect(v.getUint32(24, true)).toBe(16000); // sample rate
  expect(v.getUint16(34, true)).toBe(16); // bits
  expect(v.getUint32(40, true)).toBe(8); // data bytes: 4 samples * 2
  expect(v.getInt16(46, true)).toBe(16383); // 0.5
  expect(buf.byteLength).toBe(52);
});
