import { getRequestListener } from "@hono/node-server";
import { createApp } from "../server/app.js";

// Vercel rewrites every /api/* request to this one function; Hono routes on the original URL.
export default getRequestListener(createApp().fetch);
