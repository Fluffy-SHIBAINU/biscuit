import React, { useEffect, useState } from "react";
import QRCode from "qrcode";

/** A QR code drawn on the page for the phone's camera to read. */
export default function Qr({ text, size = 240, alt }) {
  const [src, setSrc] = useState("");
  useEffect(() => {
    let on = true;
    if (!text) { setSrc(""); return undefined; }
    QRCode.toDataURL(text, { margin: 1, width: size * 2, errorCorrectionLevel: "M" }).then((url) => { if (on) setSrc(url); }).catch(() => { if (on) setSrc(""); });
    return () => { on = false; };
  }, [text, size]);
  return src ? <img className="qr" src={src} width={size} height={size} alt={alt || "QR code"} /> : <div className="qr blank" style={{ width: size, height: size }} />;
}
