/**
 * Hono middleware for a Kindred product API. Copy with kindred-auth.ts.
 *
 *   main.use("/api/tender/*", requireKindredUser({ except: ["/api/tender/health"] }));                   // wall everything
 *   main.use("/api/tender/*", requireKindredUser({ open: readOnly, except: ["/api/tender/health"] }));   // wall writes only
 *
 * Register it before the routes it guards (Hono runs a middleware only for routes registered after it).
 */
import type { MiddlewareHandler } from "hono";
import { ISSUER, readCookie, verifySession, needsRenewal, isNavigation, loginUrl, unauthenticated, bypassUser } from "./kindred-auth.js";
import type { Context } from "hono";
import type { KindredUser, Verifier } from "./kindred-auth.js";

declare module "hono" {
  interface ContextVariableMap {
    kindredUser: KindredUser;
  }
}

export type RequireOptions = {
  /** Exact paths that pass without a session (health checks). */
  except?: string[];
  /** A request for which this returns true passes without a session and without `kindredUser`: a read/write split (`readOnly`). */
  open?: (c: Context) => boolean;
  verify?: Verifier;
  env?: Record<string, string | undefined>;
  now?: () => number;
  issuer?: string;
};

/** A read: GET or HEAD. With `open: readOnly` the Wall stands on writes only and never looks at the cookie on a read. */
export function readOnly(c: Context): boolean {
  return c.req.method === "GET" || c.req.method === "HEAD";
}

/** The address the reader typed: behind a Vercel rewrite c.req.url names the Cloud Run host, X-Forwarded-Host the real one. */
export function publicUrl(c: Context): string {
  const xfh = c.req.header("x-forwarded-host");
  if (!xfh) return c.req.url;
  const u = new URL(c.req.url);
  return `${c.req.header("x-forwarded-proto") || "https"}://${xfh}${u.pathname}${u.search}`;
}

export function requireKindredUser(o: RequireOptions = {}): MiddlewareHandler {
  const except = new Set(o.except ?? []);
  const open = o.open;
  const verify = o.verify ?? verifySession;
  const env = o.env ?? process.env;
  const now = o.now ?? (() => Date.now());
  const issuer = o.issuer ?? ISSUER;
  return async (c, next) => {
    if (except.has(c.req.path) || (open && open(c))) return next();
    const t = now();
    const user = bypassUser(env, t, c.req.header("host") ?? new URL(c.req.url).host) ?? (await verify(readCookie(c.req.header("cookie")), { now: new Date(t) }));
    const nav = isNavigation(c.req.raw.headers);
    if (user && !(nav && needsRenewal(user, t))) {
      c.set("kindredUser", user);
      return next();
    }
    const url = publicUrl(c);
    if (nav) return c.redirect(loginUrl(url, issuer), 303);
    c.header("Cache-Control", "no-store");
    return c.json(unauthenticated(url, issuer), 401);
  };
}
