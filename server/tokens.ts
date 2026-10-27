import { createHash, randomBytes } from "node:crypto";

/** Device tokens: 32 random bytes; only the sha256 hex hash is stored. */
export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export function newToken(): { token: string; hash: string } {
  const token = randomBytes(32).toString("base64url");
  return { token, hash: hashToken(token) };
}
