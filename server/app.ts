import { Hono } from "hono";
import { deviceAuth, type Lookup } from "./auth.js";
import { dbEvents, type Events } from "./events.js";
import { letterRoutes, type SamDeps, type SparkDeps } from "./routes/letter.js";
import { linkRoutes } from "./routes/link.js";
import { rosaRoutes, type AsrFn } from "./routes/rosa.js";
import { questionRoutes } from "./routes/question.js";
import { sheetRoutes, type SheetFn } from "./routes/sheet.js";
import { docketRoutes } from "./routes/docket.js";
import { anaRoutes } from "./routes/ana.js";
import { pushRoutes } from "./routes/push.js";
import { anaAuth } from "./auth.js";
import type { Chooser } from "./questions.js";

export const VERSION = "0.1.0";

export type AppOptions = { lookup?: Lookup; asr?: AsrFn; spark?: SparkDeps; sam?: SamDeps; events?: Events; chooser?: Chooser; sheet?: SheetFn; anaEnv?: Record<string, string | undefined> };

export function createApp(opts: AppOptions = {}): Hono {
  const app = new Hono();
  const auth = deviceAuth({ lookup: opts.lookup });
  const events = opts.events ?? dbEvents;
  app.get("/api/biscuit/health", (c) => c.json({ ok: true, version: VERSION }));
  app.route("/api/biscuit", linkRoutes);
  app.route("/api/biscuit", rosaRoutes({ auth, asr: opts.asr }));
  app.route("/api/biscuit", letterRoutes({ auth, spark: opts.spark, sam: opts.sam, events, sheet: opts.sheet }));
  app.route("/api/biscuit", docketRoutes({ auth, events }));
  app.route("/api/biscuit", anaRoutes({ env: opts.anaEnv }));
  app.route("/api/biscuit", pushRoutes({ auth, anaAuth: anaAuth({ env: opts.anaEnv }), events }));
  app.route("/api/biscuit", questionRoutes({ auth, chooser: opts.chooser }));
  app.route("/api/biscuit", sheetRoutes({ auth, sheet: opts.sheet }));
  return app;
}
