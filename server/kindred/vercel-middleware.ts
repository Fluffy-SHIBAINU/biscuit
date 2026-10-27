/**
 * Vercel routing middleware for a static site or a Vite SPA on a kindred-ai.dev subdomain. Copy this file and
 * kindred-auth.ts into the project, add `jose` and `@vercel/functions`, and write `middleware.ts` at the deployed root:
 *
 *   import { createMiddleware } from "./vercel-middleware";
 *   export const config = { matcher: ["/((?!_vercel/|(?:robots\\.txt|sitemap\\.xml|icon\\.svg|favicon\\.ico|apple-touch-icon\\.png|og\\.png|manifest\\.webmanifest|sw\\.js)$).*)"] };
 *   export default createMiddleware();
 *
 * Keep `config` a literal in that file: Vercel reads it statically. The matcher gates HTML, scripts, styles and data,
 * so an unauthenticated visitor never receives the bundle; crawler files, icons, the manifest and the service-worker
 * script stay open (a gated worker script breaks registration). Add the product's own public files to the list.
 */
import { next } from "@vercel/functions";
import { readCookie, verifySession, needsRenewal, isNavigation, loginUrl, unauthenticated, bypassUser } from "./kindred-auth.js";
import type { Verifier } from "./kindred-auth.js";

export const EXEMPT = ["robots.txt", "sitemap.xml", "icon.svg", "favicon.ico", "apple-touch-icon.png", "og.png", "manifest.webmanifest", "sw.js"];
/** The default matcher, as a path-to-regexp pattern; products paste it as a literal. */
export const MATCHER = `/((?!_vercel/|(?:${EXEMPT.map((n) => n.replace(".", "\\.")).join("|")})$).*)`;

export type MiddlewareOptions = { verify?: Verifier; env?: Record<string, string | undefined>; now?: () => number };

export function createMiddleware(o: MiddlewareOptions = {}): (req: Request) => Promise<Response> {
  const verify = o.verify ?? verifySession;
  const env = o.env ?? (typeof process !== "undefined" ? process.env : {});
  const now = o.now ?? (() => Date.now());
  return async function middleware(req: Request): Promise<Response> {
    const t = now();
    const user = bypassUser(env, t, new URL(req.url).host) ?? (await verify(readCookie(req.headers.get("cookie")), { now: new Date(t) }));
    const nav = isNavigation(req.headers);
    if (user && !(nav && needsRenewal(user, t))) return next();
    if (nav) return Response.redirect(loginUrl(req.url), 303);
    return Response.json(unauthenticated(req.url), { status: 401, headers: { "cache-control": "no-store" } });
  };
}

export const config = { matcher: [MATCHER] };
export default createMiddleware();
