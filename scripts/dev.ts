// Local dev server: the Hono API and the Vite frontend on one port, with .env.local loaded from the repo root.
// Ana's pages are not walled here (the Vercel middleware does not run); the API honours KINDRED_AUTH_BYPASS, and
// BISCUIT_DEV_EMAIL stands in for it when .env.local leaves it empty.
import path from "node:path";
import { fileURLToPath } from "node:url";
import { config } from "dotenv";
import http from "node:http";
import { createServer as createViteServer } from "vite";
import { getRequestListener } from "@hono/node-server";
import { createApp } from "../server/app.js";

const root = fileURLToPath(new URL("..", import.meta.url));
process.chdir(root);
config({ path: path.join(root, ".env.local"), override: true });
if (!process.env.KINDRED_AUTH_BYPASS && process.env.BISCUIT_DEV_EMAIL) process.env.KINDRED_AUTH_BYPASS = process.env.BISCUIT_DEV_EMAIL;

const port = Number(process.env.PORT ?? 5173);
const vite = await createViteServer({ root, configFile: path.join(root, "vite.config.js"), server: { middlewareMode: true }, appType: "spa" });
const api = getRequestListener(createApp().fetch);
http.createServer((req, res) => {
  if (req.url?.startsWith("/api/")) { void api(req, res); return; }
  vite.middlewares(req, res, () => { res.statusCode = 404; res.end("not found"); });
}).listen(port, () => console.log(`biscuit dev on http://localhost:${port} (root ${root}, bypass ${process.env.KINDRED_AUTH_BYPASS ? "on" : "off"})`));
