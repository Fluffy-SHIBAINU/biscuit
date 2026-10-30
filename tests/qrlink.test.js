import { expect, test } from "vitest";
import { codeFromSearch, installFirst, linkUrl } from "../src/lib/qrlink.js";

// Ana's page shows the link code as a QR too: scanning opens the link page with the code and the phone's role in the URL.
test("linkUrl carries the code and the kind on the link page", () => {
  expect(linkUrl("123456", "rosa", "https://biscuit.kindred-ai.dev")).toBe("https://biscuit.kindred-ai.dev/link?code=123456&kind=rosa");
  expect(linkUrl("900002", "cam", "http://localhost:3000")).toBe("http://localhost:3000/link?code=900002&kind=cam");
});

test("codeFromSearch reads a six-digit code and the kind, and refuses anything else", () => {
  expect(codeFromSearch("?code=123456&kind=cam")).toEqual({ code: "123456", kind: "cam" });
  expect(codeFromSearch("?code=123456")).toEqual({ code: "123456", kind: "rosa" });
  expect(codeFromSearch("?code=123456&kind=toaster")).toEqual({ code: "123456", kind: "rosa" });
  expect(codeFromSearch("?code=12345")).toBeNull();
  expect(codeFromSearch("?code=12a456")).toBeNull();
  expect(codeFromSearch("")).toBeNull();
  expect(codeFromSearch("?kind=cam")).toBeNull();
});

// iOS keeps a Home Screen app's storage apart from Safari's, so Rosa's phone links inside the installed app, not in the
// browser the QR opened; every other phone, and the camera phone anywhere, links straight away.
test("installFirst says when the scanned code must wait for the Home Screen install", () => {
  const iphone = "Mozilla/5.0 (iPhone; CPU iPhone OS 19_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/19.0 Mobile/15E148 Safari/604.1";
  const android = "Mozilla/5.0 (Linux; Android 15; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Mobile Safari/537.36";
  expect(installFirst({ ua: iphone, standalone: false, kind: "rosa" })).toBe(true);
  expect(installFirst({ ua: iphone, standalone: true, kind: "rosa" })).toBe(false);
  expect(installFirst({ ua: iphone, standalone: false, kind: "cam" })).toBe(false);
  expect(installFirst({ ua: android, standalone: false, kind: "rosa" })).toBe(false);
  expect(installFirst({ ua: "", standalone: false, kind: "rosa" })).toBe(false);
});
