/**
 * Kindred session verifier. Copy this file into a product; it depends on `jose` only and runs on Vercel Edge,
 * Node and Hono. The Issuer (id.kindred-ai.dev) signs a session JWT (ES256) into the `kindred_session` cookie on
 * `Domain=kindred-ai.dev`; this file checks it against the Issuer's published keys. Nothing here calls the Issuer
 * per request: keys are fetched once and cached by jose, refetched on an unknown key id.
 */
import { createRemoteJWKSet, jwtVerify } from "jose";
import type { JWTVerifyGetKey } from "jose";

export const COOKIE = "kindred_session";
export const ISSUER = "https://id.kindred-ai.dev";
export const AUDIENCE = "kindred-ai.dev";
export const RENEW_SECONDS = 86400;
/** The Issuer's ten-minute OAuth state cookie is a JWT with this `typ`; it must never pass as a session. */
export const STATE_TYP = "kindred-oauth";
export const CLOCK_TOLERANCE_SECONDS = 60;

export type KindredUser = { sub: string; email: string; exp: number };
export type VerifyOptions = { now?: Date };
export type Verifier = (token: string | null | undefined, opts?: VerifyOptions) => Promise<KindredUser | null>;

/** A verifier bound to a key source. The Issuer uses its local keys; products use the remote JWKS. */
export function createVerifier(getKey: JWTVerifyGetKey, bind: { issuer: string; audience: string } = { issuer: ISSUER, audience: AUDIENCE }): Verifier {
  return async function verify(token, opts = {}) {
    if (typeof token !== "string" || token.length === 0) return null;
    try {
      const { payload, protectedHeader } = await jwtVerify(token, getKey, {
        algorithms: ["ES256"],
        issuer: bind.issuer,
        audience: bind.audience,
        clockTolerance: CLOCK_TOLERANCE_SECONDS,
        currentDate: opts.now,
      });
      if (protectedHeader.typ === STATE_TYP) return null;
      const { sub, email, exp } = payload;
      if (typeof sub !== "string" || !sub || typeof email !== "string" || !email || typeof exp !== "number") return null;
      return { sub, email, exp };
    } catch {
      return null;
    }
  };
}

let remote: Verifier | null = null;
/** Verify against https://id.kindred-ai.dev/.well-known/jwks.json (cached). */
export function verifySession(token: string | null | undefined, opts?: VerifyOptions): Promise<KindredUser | null> {
  remote ??= createVerifier(createRemoteJWKSet(new URL(`${ISSUER}/.well-known/jwks.json`)));
  return remote(token, opts);
}

/** The value of one cookie from a Cookie header, or null. */
export function readCookie(header: string | null | undefined, name: string = COOKIE): string | null {
  if (!header) return null;
  for (const part of header.split(";")) {
    const eq = part.indexOf("=");
    if (eq < 0) continue;
    if (part.slice(0, eq).trim() === name) return part.slice(eq + 1).trim() || null;
  }
  return null;
}

/** True within RENEW_SECONDS of expiry: a navigation then goes through the Issuer again (spec §2.5). */
export function needsRenewal(u: KindredUser, now: number = Date.now()): boolean {
  return u.exp * 1000 - now < RENEW_SECONDS * 1000;
}

/** A top-level page load (redirect to sign-in) as opposed to a fetch (401 JSON) — spec §3.4. */
export function isNavigation(headers: Headers): boolean {
  const mode = headers.get("sec-fetch-mode");
  if (mode) return mode === "navigate";
  return (headers.get("accept") || "").includes("text/html");
}

export function loginUrl(returnTo: string, issuer: string = ISSUER): string {
  return `${issuer}/login?return_to=${encodeURIComponent(returnTo)}`;
}

export function unauthenticated(returnTo: string, issuer: string = ISSUER): { error: "unauthenticated"; login: string } {
  return { error: "unauthenticated", login: loginUrl(returnTo, issuer) };
}

/** True for localhost, 127.0.0.1 and [::1], with or without a port. */
export function isLocalHost(host: string | null | undefined): boolean {
  if (!host) return false;
  const h = host.replace(/:\d+$/, "").toLowerCase();
  return h === "localhost" || h === "127.0.0.1" || h === "[::1]";
}

/**
 * Local development only: KINDRED_AUTH_BYPASS=<email> stands in for a session, and only for a request that arrived
 * at localhost (`host` is the request's Host). Ignored in production and on every public host.
 */
export function bypassUser(env: Record<string, string | undefined>, now: number = Date.now(), host?: string | null): KindredUser | null {
  const email = env.KINDRED_AUTH_BYPASS;
  if (!email || env.NODE_ENV === "production" || !isLocalHost(host)) return null;
  return { sub: "bypass", email: email.toLowerCase(), exp: Math.floor(now / 1000) + 365 * 86400 };
}
