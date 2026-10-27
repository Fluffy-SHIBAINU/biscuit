import { api } from "./api.js";

export async function findMailbox(jpegBlob, point) {
  const form = new FormData();
  form.set("image", jpegBlob, "view.jpg");
  if (point) form.set("point", `${point.x.toFixed(3)},${point.y.toFixed(3)}`);
  else form.set("prompt", "mailbox");
  return api("/cam/find", { method: "POST", form });
}
export const setRegion = (region) => api("/cam/region", { method: "POST", json: { region } });
export const heartbeat = (battery, charging) => api("/cam/heartbeat", { method: "POST", json: { battery, charging } });
export const sendFrames = (blobs, test = false) => {
  const form = new FormData();
  blobs.forEach((b, i) => form.set(`frame${i + 1}`, b, `f${i + 1}.jpg`));
  if (test) form.set("test", "1");
  return api("/cam/frames", { method: "POST", form });
};
export const setTest = (result) => api("/cam/test", { method: "POST", json: { result } });

/** The watched region grown by 20 percent on each side, as the server stores it. */
export function padRegion(box, pad = 0.2) {
  const px = box.w * pad, py = box.h * pad;
  const x = Math.max(0, box.x - px), y = Math.max(0, box.y - py);
  const right = Math.min(1, box.x + box.w + px), bottom = Math.min(1, box.y + box.h + py);
  const r3 = (n) => Math.round(n * 1000) / 1000;
  return { x: r3(x), y: r3(y), w: r3(right - x), h: r3(bottom - y) };
}
