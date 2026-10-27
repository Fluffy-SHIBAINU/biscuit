import { Hono } from "hono";
import { linkRoutes } from "./routes/link.js";

export const VERSION = "0.1.0";

export function createApp(): Hono {
  const app = new Hono();
  app.get("/api/biscuit/health", (c) => c.json({ ok: true, version: VERSION }));
  app.route("/api/biscuit", linkRoutes);
  return app;
}
