import { Hono } from "hono";
import { deviceAuth, type Lookup } from "./auth.js";
import { dbEvents, type Events } from "./events.js";
import { letterRoutes, type SamDeps, type SparkDeps } from "./routes/letter.js";
import { linkRoutes } from "./routes/link.js";
import { rosaRoutes, type AsrFn } from "./routes/rosa.js";

export const VERSION = "0.1.0";

export type AppOptions = { lookup?: Lookup; asr?: AsrFn; spark?: SparkDeps; sam?: SamDeps; events?: Events };

export function createApp(opts: AppOptions = {}): Hono {
  const app = new Hono();
  const auth = deviceAuth({ lookup: opts.lookup });
  const events = opts.events ?? dbEvents;
  app.get("/api/biscuit/health", (c) => c.json({ ok: true, version: VERSION }));
  app.route("/api/biscuit", linkRoutes);
  app.route("/api/biscuit", rosaRoutes({ auth, asr: opts.asr }));
  app.route("/api/biscuit", letterRoutes({ auth, spark: opts.spark, sam: opts.sam, events }));
  return app;
}
