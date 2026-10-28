import { eq } from "drizzle-orm";
import { Hono } from "hono";
import type { MiddlewareHandler } from "hono";
import type { AuthVars } from "../auth.js";
import { allowSamCall, bestDetection, COLLECT_PROMPTS, collectAllowed, SAM_DAILY_CAP, TEST_PROMPTS, WATCH_PROMPTS } from "../cam.js";
import type { Events } from "../events.js";
import { MAIL_PAYLOAD, sendPush } from "../push.js";
import { getDb } from "../db.js";
import { detect } from "../meta/sam.js";
import type { SamDeps } from "./letter.js";
import { cam, camSample, device, type Region } from "../schema.js";

export const MAX_FIND_BYTES = 600_000;
export const MAX_FRAME_BYTES = 300_000;
const today = () => new Date().toISOString().slice(0, 10);

function validRegion(r: any): r is Region {
  const ok = (n: unknown) => typeof n === "number" && n >= 0 && n <= 1;
  return r && ok(r.x) && ok(r.y) && ok(r.w) && ok(r.h) && r.w > 0 && r.h > 0 && r.x + r.w <= 1.001 && r.y + r.h <= 1.001;
}

type CamRow = typeof cam.$inferSelect;
export type CamSampleRow = { householdId: string; deviceId: string | null; test: boolean; level: number | null; seen: string | null; scores: Record<string, number>; frames: string[] };
/** The watcher's rows: read, update, and keep a calibration sample. The live store is the database; tests pass their own. */
export type CamStore = { get(householdId: string): Promise<CamRow | null>; update(householdId: string, patch: Partial<CamRow>): Promise<void>; keep(row: CamSampleRow): Promise<void> };

export const dbCamStore: CamStore = {
  async get(householdId) { const [row] = await getDb().select().from(cam).where(eq(cam.householdId, householdId)).limit(1); return row ?? null; },
  async update(householdId, patch) { await getDb().update(cam).set(patch).where(eq(cam.householdId, householdId)); },
  async keep(row) { await getDb().insert(camSample).values(row); },
};

export function camRoutes(deps: { auth: MiddlewareHandler<AuthVars>; sam?: SamDeps; events: Events; env?: Record<string, string | undefined>; store?: CamStore }) {
  const sam: SamDeps = deps.sam ?? { detect };
  const env = deps.env ?? process.env;
  const store = deps.store ?? dbCamStore;
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
    .post("/cam/frames", deps.auth, async (c) => {
      const form = await c.req.formData();
      const frames: Buffer[] = [];
      for (const key of ["frame1", "frame2", "frame3"]) {
        const f = form.get(key);
        if (f instanceof Blob) {
          if (f.size > MAX_FRAME_BYTES) return c.json({ error: "too_large" }, 413);
          frames.push(Buffer.from(await f.arrayBuffer()));
        }
      }
      if (!frames.length) return c.json({ error: "no_frames" }, 400);
      const isTest = form.get("test") === "1";
      const db = getDb();
      const h = c.var.household;
      const row = await store.get(h.id);
      if (!row) return c.json({ error: "not_set" }, 409);
      if (row.paused && !isTest) return c.json({ error: "paused" }, 409);
      const day = today();
      let calls = row.samDay === day ? row.samCallsToday : 0;
      if (!allowSamCall({ samCallsToday: calls, samDay: row.samDay === day ? day : null }, day)) {
        await store.update(h.id, { paused: true });
        await deps.events.record(h.id, c.var.device.id, "cam_paused", { reason: "cap", cap: SAM_DAILY_CAP });
        return c.json({ error: "cap" }, 429);
      }
      // Collect mode: every prompt is scored on the first frame and the frames are kept with those scores for calibration.
      const collecting = collectAllowed(env, h.ownerEmail, String(form.get("collect") ?? ""));
      let seen: string | null = null;
      const scores: Record<string, number> = {};
      if (collecting) {
        for (const prompt of COLLECT_PROMPTS) {
          if (calls >= SAM_DAILY_CAP) break;
          calls++;
          const best = bestDetection(await sam.detect(frames[0], { text: prompt }), 0);
          scores[prompt] = best ? Math.round(best.score * 1000) / 1000 : 0;
          if (!seen && best && best.score >= 0.5 && (isTest ? (TEST_PROMPTS as readonly string[]) : (WATCH_PROMPTS as readonly string[])).includes(prompt)) seen = prompt;
        }
      }
      outer: for (const prompt of isTest ? TEST_PROMPTS : WATCH_PROMPTS) {
        if (seen) break;
        for (const frame of collecting ? frames.slice(1) : frames) {
          if (calls >= SAM_DAILY_CAP) break outer;
          calls++;
          const best = bestDetection(await sam.detect(frame, { text: prompt }));
          if (best) { seen = prompt; break outer; }
        }
      }
      await store.update(h.id, { samCallsToday: calls, samDay: day, lastMotionAt: new Date() });
      let kept = false;
      if (collecting) {
        const level = Number(form.get("level"));
        // Keeping a sample never breaks the watch: a missing table or a full disk only means this one is not kept.
        try {
          await store.keep({ householdId: h.id, deviceId: c.var.device.id, test: isTest, level: Number.isFinite(level) ? level : null, seen, scores, frames: frames.map((f) => `data:image/jpeg;base64,${f.toString("base64")}`) });
          kept = true;
        } catch (err: any) {
          console.warn(JSON.stringify({ cam: "keep_failed", error: String(err?.message ?? err).slice(0, 200) }));
        }
      }
      if (seen && !isTest) {
        const id = await deps.events.record(h.id, c.var.device.id, "mail_seen", { seen });
        await sendPush(db, h.id, ["rosa"], MAIL_PAYLOAD(h.called, id)).catch(() => ({ sent: 0 }));
      }
      return c.json({ seen, callsToday: calls, ...(collecting ? { kept } : {}) });
    })
    .post("/cam/test", deps.auth, async (c) => {
      const b = await c.req.json().catch(() => ({}));
      const result = b?.result === "works" ? "works" : b?.result === "pending" ? "pending" : null;
      if (!result) return c.json({ error: "bad_result" }, 400);
      const rows = await getDb().update(cam).set({ testStatus: result }).where(eq(cam.householdId, c.var.household.id)).returning({ id: cam.householdId });
      return rows.length ? c.json({ ok: true }) : c.json({ error: "not_set" }, 409);
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
