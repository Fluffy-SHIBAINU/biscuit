export function fitLongSide(w, h, longSide) {
  const long = Math.max(w, h);
  if (long <= longSide) return { w, h };
  const k = longSide / long;
  return { w: Math.round(w * k), h: Math.round(h * k) };
}

export async function openCamera(video, facing = "environment") {
  const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: facing }, width: { ideal: 1920 }, height: { ideal: 1440 } }, audio: false });
  video.srcObject = stream;
  video.setAttribute("playsinline", "true");
  video.muted = true;
  await video.play().catch(() => {});
  return stream;
}

export function stopCamera(stream) {
  stream?.getTracks().forEach((t) => t.stop());
}

/** A JPEG of the current video frame, resized to the long side and squeezed under maxBytes. */
export async function grabJpeg(video, longSide, maxBytes) {
  const { w, h } = fitLongSide(video.videoWidth || 1280, video.videoHeight || 960, longSide);
  const canvas = document.createElement("canvas");
  canvas.width = w; canvas.height = h;
  canvas.getContext("2d").drawImage(video, 0, 0, w, h);
  for (let q = 0.9; q >= 0.3; q -= 0.1) {
    const blob = await new Promise((r) => canvas.toBlob(r, "image/jpeg", q));
    if (blob && blob.size <= maxBytes) return blob;
  }
  return await new Promise((r) => canvas.toBlob(r, "image/jpeg", 0.3));
}
