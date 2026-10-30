// The link code as a QR: Ana's page shows it, the phone's camera opens the link page with the code and the phone's role.

const KINDS = new Set(["rosa", "cam"]);

/** The URL inside the QR code. */
export function linkUrl(code, kind, origin) {
  return `${origin}/link?code=${encodeURIComponent(code)}&kind=${KINDS.has(kind) ? kind : "rosa"}`;
}

/** The scanned code and kind from the link page's query, or null when there is no six-digit code. */
export function codeFromSearch(search) {
  const q = new URLSearchParams(search || "");
  const code = q.get("code") || "";
  if (!/^\d{6}$/.test(code)) return null;
  const kind = q.get("kind");
  return { code, kind: KINDS.has(kind) ? kind : "rosa" };
}

/**
 * iOS keeps a Home Screen app's storage apart from Safari's, so Rosa's phone must link inside the installed app, not in
 * the browser the QR opened: the page then shows the code to type after Add to Home Screen. Every other phone, and the
 * camera phone anywhere, links straight away.
 */
export function installFirst({ ua, standalone, kind }) {
  return kind === "rosa" && !standalone && /iPhone|iPad|iPod/i.test(ua || "");
}
