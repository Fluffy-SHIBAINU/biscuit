// The box drawn by hand over the live preview: pure geometry in the frame's normalised coordinates (0 to 1 on each
// axis), so the same box fits the preview, the watcher's crop and the server's region. Nothing here touches the camera.

/** Each side of the box is at least a tenth of the frame. */
export const MIN_SIDE = 0.1;
/** A corner handle answers to a finger within this many CSS pixels of the corner. */
export const HANDLE_PX = 28;
/** Travel under this many CSS pixels is a tap, not a draw. */
export const TAP_PX = 10;

const clamp01 = (n) => Math.min(1, Math.max(0, n));
const r3 = (n) => Math.round(n * 1000) / 1000;

/** The normalised point of a client position inside the frame's rect, clamped to the frame. */
export function pointIn(rect, clientX, clientY) {
  return { x: clamp01((clientX - rect.left) / rect.width), y: clamp01((clientY - rect.top) / rect.height) };
}

/** The box spanning two points, in either order. */
export function boxFrom(a, b) {
  return { x: Math.min(a.x, b.x), y: Math.min(a.y, b.y), w: Math.abs(a.x - b.x), h: Math.abs(a.y - b.y) };
}

/** The box inside the frame with each side at least `min`: a small box grows around its centre, a spilling one is pushed back in. */
export function clampBox(box, min = MIN_SIDE) {
  const w = Math.min(1, Math.max(min, box.w)), h = Math.min(1, Math.max(min, box.h));
  const x = Math.min(1 - w, Math.max(0, box.x + box.w / 2 - w / 2)), y = Math.min(1 - h, Math.max(0, box.y + box.h / 2 - h / 2));
  return { x, y, w, h };
}

/** What a finger at `p` touches: the nearest corner handle within reach ("nw", "ne", "sw", "se"), the inside ("move"), or nothing. `size` is the frame in CSS pixels. */
export function hitTest(box, p, size, px = HANDLE_PX) {
  if (!box) return null;
  const rx = px / size.width, ry = px / size.height;
  const corners = { nw: [box.x, box.y], ne: [box.x + box.w, box.y], sw: [box.x, box.y + box.h], se: [box.x + box.w, box.y + box.h] };
  let hit = null, best = Infinity;
  for (const [name, [cx, cy]] of Object.entries(corners)) {
    const dx = Math.abs(p.x - cx) / rx, dy = Math.abs(p.y - cy) / ry;
    if (dx <= 1 && dy <= 1 && dx + dy < best) { hit = name; best = dx + dy; }
  }
  if (hit) return hit;
  return p.x >= box.x && p.x <= box.x + box.w && p.y >= box.y && p.y <= box.y + box.h ? "move" : null;
}

/** The box after a finger travelled from `from` to `to` on `part`: "move" carries the whole box, a corner name carries that corner. It stays in the frame and no side goes under `min`. */
export function dragBox(start, part, from, to, min = MIN_SIDE) {
  const dx = to.x - from.x, dy = to.y - from.y;
  if (part === "move") return { x: Math.min(1 - start.w, Math.max(0, start.x + dx)), y: Math.min(1 - start.h, Math.max(0, start.y + dy)), w: start.w, h: start.h };
  let left = start.x, top = start.y, right = start.x + start.w, bottom = start.y + start.h;
  if (part === "nw" || part === "sw") left = Math.min(right - min, Math.max(0, left + dx));
  if (part === "ne" || part === "se") right = Math.max(left + min, Math.min(1, right + dx));
  if (part === "nw" || part === "ne") top = Math.min(bottom - min, Math.max(0, top + dy));
  if (part === "sw" || part === "se") bottom = Math.max(top + min, Math.min(1, bottom + dy));
  return { x: left, y: top, w: right - left, h: bottom - top };
}

/** True when the finger travelled under `px` pixels: a tap, not a draw. */
export function isTap(from, to, size, px = TAP_PX) {
  return Math.hypot((to.x - from.x) * size.width, (to.y - from.y) * size.height) < px;
}

/** The box a draw from `from` to `to` leaves: null for a tap, else the clamped box between the two points. */
export function finishDraw(from, to, size, min = MIN_SIDE) {
  return isTap(from, to, size) ? null : clampBox(boxFrom(from, to), min);
}

/** Three decimals a side, as the server stores the region. */
export function roundBox(box) {
  return { x: r3(box.x), y: r3(box.y), w: r3(box.w), h: r3(box.h) };
}

// The preview is object-fit: cover: the frame shows the video scaled to fill it, with the overflow cropped. A box lives
// in the video's own coordinates (what the watcher crops and the server stores); the person draws in the frame's.

/** The `.frame` aspect in app.css (4:5); only the ratio matters where a frame size is needed for drawing. */
export const FRAME = { width: 4, height: 5 };

/** The video element's own size once it has metadata, else null: the preview is then taken as the whole frame. */
export function videoSizeOf(el) {
  return el && el.videoWidth && el.videoHeight ? { width: el.videoWidth, height: el.videoHeight } : null;
}

/** How a video of `video` pixels fills a frame of `frame` pixels under cover: the scale, and the video's top-left inside the frame (zero or negative, in frame pixels). */
export function coverFit(frame, video) {
  const scale = Math.max(frame.width / video.width, frame.height / video.height);
  return { scale, ox: (frame.width - video.width * scale) / 2, oy: (frame.height - video.height * scale) / 2 };
}

/** A frame-normalised point as a video-normalised one; the identity when the video's size is not known. */
export function frameToVideo(p, frame, video) {
  if (!video) return { x: p.x, y: p.y };
  const { scale, ox, oy } = coverFit(frame, video);
  return { x: clamp01((p.x * frame.width - ox) / (video.width * scale)), y: clamp01((p.y * frame.height - oy) / (video.height * scale)) };
}

/** A frame-normalised box as a video-normalised one. */
export function frameToVideoBox(box, frame, video) {
  return boxFrom(frameToVideo({ x: box.x, y: box.y }, frame, video), frameToVideo({ x: box.x + box.w, y: box.y + box.h }, frame, video));
}

/** A video-normalised box as a frame-normalised one, for drawing over the frame; it spills past the frame where the video is cropped. */
export function videoToFrame(box, frame, video) {
  if (!video) return { x: box.x, y: box.y, w: box.w, h: box.h };
  const { scale, ox, oy } = coverFit(frame, video);
  const sx = (video.width * scale) / frame.width, sy = (video.height * scale) / frame.height;
  return { x: box.x * sx + ox / frame.width, y: box.y * sy + oy / frame.height, w: box.w * sx, h: box.h * sy };
}

/** The CSS of a video box over the 4:5 frame: where the cover-fitted preview shows it. */
export function regionStyle(box, video, frame = FRAME) {
  const f = videoToFrame(box, frame, video);
  return { left: `${f.x * 100}%`, top: `${f.y * 100}%`, width: `${f.w * 100}%`, height: `${f.h * 100}%` };
}
