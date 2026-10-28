import { Hono } from "hono";
import { deviceAuth, requireKind, type Lookup } from "./auth.js";
import { dbEvents, type Events } from "./events.js";
import { letterRoutes, type SamDeps, type SparkDeps } from "./routes/letter.js";
import { linkRoutes } from "./routes/link.js";
import { rosaRoutes, type AsrFn } from "./routes/rosa.js";
import { questionRoutes } from "./routes/question.js";
import { sheetRoutes, type SheetFn } from "./routes/sheet.js";
import { docketRoutes } from "./routes/docket.js";
import { anaRoutes } from "./routes/ana.js";
import { pushRoutes } from "./routes/push.js";
import { camRoutes, type CamStore } from "./routes/cam.js";
import { helpRoutes } from "./routes/help.js";
import type { Sender } from "./push.js";
import { dbLimiter, type Limiter } from "./limits.js";
import { getDb } from "./db.js";
import { householdRoutes } from "./routes/household.js";
import { anaAuth } from "./auth.js";
import type { Chooser } from "./questions.js";

export const VERSION = "0.1.0";

export type AppOptions = { lookup?: Lookup; asr?: AsrFn; spark?: SparkDeps; reader2?: SparkDeps | null; shadow?: SparkDeps | null; waitUntil?: (p: Promise<unknown>) => void; readTimeoutMs?: number; sam?: SamDeps; events?: Events; chooser?: Chooser; sheet?: SheetFn; anaEnv?: Record<string, string | undefined>; camEnv?: Record<string, string | undefined>; camStore?: CamStore; pushSend?: Sender; limiter?: Limiter | null; claimLimiter?: Limiter; frameLimiter?: Limiter };

export function createApp(opts: AppOptions = {}): Hono {
  const app = new Hono();
  const live = !opts.lookup;
  const limiter = opts.limiter === null ? undefined : opts.limiter ?? (live ? dbLimiter(getDb) : undefined);
  const auth = deviceAuth({ lookup: opts.lookup, limiter, exempt: (p) => p === "/api/biscuit/letter/frame" });
  const rosaOnly = requireKind("rosa");
  const frameLimiter = opts.frameLimiter ?? (live ? dbLimiter(getDb, 120, 60) : undefined);
  const claimLimiter = opts.claimLimiter ?? (live ? dbLimiter(getDb, 10, 600) : undefined);
  app.use("/api/biscuit/asr", auth, rosaOnly);
  app.use("/api/biscuit/letter/*", auth, rosaOnly);
  app.use("/api/biscuit/letter", auth, rosaOnly);
  app.use("/api/biscuit/question", auth, rosaOnly);
  app.use("/api/biscuit/sheet", auth, rosaOnly);
  app.use("/api/biscuit/handoff", auth, rosaOnly);
  app.use("/api/biscuit/docket", auth, rosaOnly);
  app.use("/api/biscuit/help/test", auth, rosaOnly);
  app.use("/api/biscuit/help/test/:id", auth, rosaOnly);
  app.use("/api/biscuit/push/subscribe", auth, rosaOnly);
  for (const path of ["find", "region", "heartbeat", "frames", "test"]) app.use(`/api/biscuit/cam/${path}`, auth, requireKind("cam"));
  app.on(["DELETE", "PATCH"], "/api/biscuit/household", auth, rosaOnly);
  const events = opts.events ?? dbEvents;
  app.get("/api/biscuit/health", (c) => c.json({ ok: true, version: VERSION }));
  app.route("/api/biscuit", linkRoutes({ limiter: claimLimiter }));
  app.route("/api/biscuit", rosaRoutes({ auth, asr: opts.asr }));
  app.route("/api/biscuit", letterRoutes({ auth, spark: opts.spark, reader2: opts.reader2, shadow: opts.shadow, waitUntil: opts.waitUntil, readTimeoutMs: opts.readTimeoutMs, sam: opts.sam, events, sheet: opts.sheet, frameLimiter }));
  app.route("/api/biscuit", docketRoutes({ auth, events, send: opts.pushSend }));
  app.route("/api/biscuit", anaRoutes({ env: opts.anaEnv, events, send: opts.pushSend }));
  app.route("/api/biscuit", pushRoutes({ auth, anaAuth: anaAuth({ env: opts.anaEnv }), events }));
  app.route("/api/biscuit", camRoutes({ auth, sam: opts.sam, events, env: opts.camEnv, store: opts.camStore }));
  app.route("/api/biscuit", householdRoutes({ auth, anaAuth: anaAuth({ env: opts.anaEnv }) }));
  app.route("/api/biscuit", helpRoutes({ auth, anaAuth: anaAuth({ env: opts.anaEnv }), events, send: opts.pushSend }));
  app.route("/api/biscuit", questionRoutes({ auth, chooser: opts.chooser }));
  app.route("/api/biscuit", sheetRoutes({ auth, sheet: opts.sheet }));
  return app;
}
