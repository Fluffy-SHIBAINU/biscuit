import { eq } from "drizzle-orm";
import { Hono } from "hono";
import type { MiddlewareHandler } from "hono";
import type { AuthVars } from "../auth.js";
import { bestDetection } from "../cam.js";
import { getDb } from "../db.js";
import { detect } from "../meta/sam.js";
import type { SamDeps } from "./letter.js";
import { cam, device, type Region } from "../schema.js";

export const MAX_FIND_BYTES = 600_000;

function validRegion(r: any): r is Region {
  const ok = (n: unknown) => typeof n === "number" && n >= 0 && n <= 1;
  return r && ok(r.x) && ok(r.y) && ok(r.w) && ok(r.h) && r.w > 0 && r.h > 0 && r.x + r.w <= 1.001 && r.y + r.h <= 1.001;
}

export function camRoutes(deps: { auth: MiddlewareHandler<AuthVars>; sam?: SamDeps }) {
  const sam: SamDeps = deps.sam ?? { detect };
  return new Hono<AuthVars>()
    .post("/cam/find", deps.auth, async (c) => {
      const form = await c.req.formData();
      const image = form.get("image");
      if (!(image instanceof Blob)) return c.json({ error: "no_image" }, 400);
      if (image.size > MAX_FIND_BYTES) return c.json({ error: "too_large" }, 413);
      const point = String(form.get("point") ?? "");
      const m = /^([01](?:\.\d+)?),([01](?:\.\d+)?)$/.exec(point);
      const prompt = m ? { point: { x: Number(m[1]), y: Number(m[2]) } } : { text: String(form.get("prompt") || "mailbox").slice(0, 40) };
      const best = bestDetection(await sam.detect(Buffer.from(await image.arrayBuffer()), prompt));
      return best ? c.json({ box: best.box, score: best.score }) : c.json({ error: "not_found" }, 404);
    })
    .post("/cam/region", deps.auth, async (c) => {
      const b = await c.req.json().catch(() => ({}));
      if (!validRegion(b?.region)) return c.json({ error: "bad_region" }, 400);
      const h = c.var.household.id;
      const now = new Date();
      await getDb().insert(cam).values({ householdId: h, region: b.region, setAt: now, testStatus: "pending" }).onConflictDoUpdate({ target: cam.householdId, set: { region: b.region, setAt: now, testStatus: "pending", paused: false } });
      return c.json({ ok: true });
    })
    .post("/cam/heartbeat", deps.auth, async (c) => {
      const b = await c.req.json().catch(() => ({}));
      const battery = Number.isInteger(b?.battery) && b.battery >= 0 && b.battery <= 100 ? b.battery : null;
      const charging = typeof b?.charging === "boolean" ? b.charging : null;
      await getDb().update(device).set({ lastSeenAt: new Date(), battery, charging }).where(eq(device.id, c.var.device.id));
      const [row] = await getDb().select({ paused: cam.paused, testStatus: cam.testStatus }).from(cam).where(eq(cam.householdId, c.var.household.id)).limit(1);
      return c.json({ ok: true, paused: row?.paused ?? false, testStatus: row?.testStatus ?? null });
    });
}
