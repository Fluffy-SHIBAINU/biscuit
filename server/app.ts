import { Hono } from "hono";

export const VERSION = "0.1.0";

export function createApp(): Hono {
  const app = new Hono();
  app.get("/api/biscuit/health", (c) => c.json({ ok: true, version: VERSION }));
  return app;
}
