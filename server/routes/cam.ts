import { and, eq, gt, sql } from "drizzle-orm";
import { Hono } from "hono";
import type { MiddlewareHandler } from "hono";
import type { AuthVars } from "../auth.js";
import { allowSamCall, bestDetection, COLLECT_PROMPTS, collectAllowed, regionSourceOf, SAM_DAILY_CAP, WATCH_PROMPTS } from "../cam.js";
import { autoClassifies, chimesOn, CLIP_ATTACH_WINDOW_MS, CLIP_FRAMES, DEFAULT_FLOOR, floorFor, guessLabel, MAX_CLIP_FRAME_BYTES } from "../clips.js";
import type { Events } from "../events.js";
import { MAIL_PAYLOAD, sendPush } from "../push.js";
import { getDb, type Db } from "../db.js";
import { detect } from "../meta/sam.js";
import type { SamDeps } from "./letter.js";
import { cam, camSample, device, type Guess, type LabelledBy, type Region } from "../schema.js";

export const MAX_FIND_BYTES = 600_000;
export const MAX_FRAME_BYTES = 300_000;
const today = () => new Date().toISOString().slice(0, 10);
const dataUrl = (f: Buffer) => `data:image/jpeg;base64,${f.toString("base64")}`;

function validRegion(r: any): r is Region {
  const ok = (n: unknown) => typeof n === "number" && n >= 0 && n <= 1;
  return r && ok(r.x) && ok(r.y) && ok(r.w) && ok(r.h) && r.w > 0 && r.h > 0 && r.x + r.w <= 1.001 && r.y + r.h <= 1.001;
}

type CamRow = typeof cam.$inferSelect;
export type CamSampleRow = { householdId: string; deviceId: string | null; test: boolean; clip: boolean; level: number | null; seen: string | null; scores: Record<string, number>; frames: string[]; guess?: Guess | null; label?: string | null; labelledBy?: LabelledBy | null; labelledAt?: Date | null };
/** The watcher's rows: read, update, keep a sample (a collect-mode frame set or a clip row) and fill a clip with its frames. The live store is the database; tests pass their own. */
export type CamStore = { get(householdId: string): Promise<CamRow | null>; update(householdId: string, patch: Partial<CamRow>): Promise<void>; keep(row: CamSampleRow): Promise<number>; attach(id: number, householdId: string, frames: string[]): Promise<boolean> };

export const dbCamStore: CamStore = {
  async get(householdId) { const [row] = await getDb().select().from(cam).where(eq(cam.householdId, householdId)).limit(1); return row ?? null; },
  async update(householdId, patch) { await getDb().update(cam).set(patch).where(eq(cam.householdId, householdId)); },
  async keep(row) { const [r] = await getDb().insert(camSample).values(row).returning({ id: camSample.id }); return r.id; },
  // Only this household's clip, only while empty, only within the window: a clip is filled once.
  async attach(id, householdId, frames) {
    const since = new Date(Date.now() - CLIP_ATTACH_WINDOW_MS);
    const rows = await getDb().update(camSample).set({ frames }).where(and(eq(camSample.id, id), eq(camSample.householdId, householdId), eq(camSample.clip, true), sql`jsonb_array_length(${camSample.frames}) = 0`, gt(camSample.at, since))).returning({ id: camSample.id });
    return rows.length > 0;
  },
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
      // The box as the phone sent it: SAM's find padded on the phone, or the person's own drawing, unpadded.
      const source = regionSourceOf(b?.source);
      if (source === undefined) return c.json({ error: "bad_source" }, 400);
      const h = c.var.household.id;
      const now = new Date();
      await getDb().insert(cam).values({ householdId: h, region: b.region, regionSource: source, setAt: now }).onConflictDoUpdate({ target: cam.householdId, set: { region: b.region, regionSource: source, setAt: now, paused: false } });
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
      const db = getDb();
      const h = c.var.household;
      const row = await store.get(h.id);
      if (!row) return c.json({ error: "not_set" }, 409);
      if (row.paused) return c.json({ error: "paused" }, 409);
      const day = today();
      let calls = row.samDay === day ? row.samCallsToday : 0;
      if (!allowSamCall({ samCallsToday: calls, samDay: row.samDay === day ? day : null }, day)) {
        await store.update(h.id, { paused: true });
        await deps.events.record(h.id, c.var.device.id, "cam_paused", { reason: "cap", cap: SAM_DAILY_CAP });
        return c.json({ error: "cap" }, 429);
      }
      // The score at which an answer counts: the prompt's own raised floor, else the household's, learned from Ana's taps, else
      // the default. A prompt the taps taught means something other than the carrier at this box no longer chimes.
      const tuning = row.tuning ?? null;
      const base = row.floor ?? DEFAULT_FLOOR;
      const floorOf = (prompt: string) => floorFor(prompt, tuning, base);
      const prompts: readonly string[] = WATCH_PROMPTS.filter((prompt) => chimesOn(prompt, tuning));
      // Collect mode (the founder's household) scores every prompt on the first frame and keeps the full frames. A household
      // that opted into clips scores the watch prompts on the first frame and keeps a clip row the phone then fills with small
      // frames. Everyone else: the cascade, prompt by prompt, frame by frame, and nothing kept.
      const collecting = collectAllowed(env, h.ownerEmail, String(form.get("collect") ?? ""));
      const clipping = !collecting && Boolean(h.keepClips);
      const firstFrame: readonly string[] = collecting ? COLLECT_PROMPTS : clipping ? WATCH_PROMPTS : [];
      let seen: string | null = null;
      const scores: Record<string, number> = {};
      for (const prompt of firstFrame) {
        if (calls >= SAM_DAILY_CAP) break;
        calls++;
        const best = bestDetection(await sam.detect(frames[0], { text: prompt }), 0);
        scores[prompt] = best ? Math.round(best.score * 1000) / 1000 : 0;
        if (!seen && best && best.score >= floorOf(prompt) && prompts.includes(prompt)) seen = prompt;
      }
      outer: for (const prompt of prompts) {
        if (seen) break;
        for (const frame of firstFrame.length ? frames.slice(1) : frames) {
          if (calls >= SAM_DAILY_CAP) break outer;
          calls++;
          const best = bestDetection(await sam.detect(frame, { text: prompt }), floorOf(prompt));
          if (best) { seen = prompt; break outer; }
        }
      }
      await store.update(h.id, { samCallsToday: calls, samDay: day, lastMotionAt: new Date() });
      const levelField = form.get("level");
      const level = typeof levelField === "string" && levelField !== "" ? Number(levelField) : NaN;
      const sample = { householdId: h.id, deviceId: c.var.device.id, test: false, level: Number.isFinite(level) ? level : null, seen, scores };
      // Every movement the phone sent shows on Ana's page: when, what SAM saw, the motion level; never an image here.
      try { await deps.events.record(h.id, c.var.device.id, "cam_motion", { seen, level: sample.level }); } catch (err: any) { console.warn(JSON.stringify({ cam: "motion_event_failed", error: String(err?.message ?? err).slice(0, 200) })); }
      let kept = false;
      let clipId: number | null = null;
      // Biscuit's guess rides on every kept row. At a well-taught box a sure guess on a trusted prompt becomes the clip's label,
      // Biscuit's; the founder's collect-mode rows get the guess only, their labels come from the sheet.
      let guess: Guess | null = null;
      if (collecting || clipping) {
        guess = guessLabel(scores, tuning, base);
        if (clipping && autoClassifies(guess, tuning)) guess = { ...guess, auto: true };
      }
      // Keeping a sample never breaks the watch: a missing table or a full disk only means this one is not kept.
      if (collecting) {
        try { await store.keep({ ...sample, clip: false, frames: frames.map(dataUrl), guess }); kept = true; } catch (err: any) { console.warn(JSON.stringify({ cam: "keep_failed", error: String(err?.message ?? err).slice(0, 200) })); }
      } else if (clipping) {
        const classified = guess?.auto ? { label: guess.label, labelledBy: "biscuit" as const, labelledAt: new Date() } : {};
        try { clipId = await store.keep({ ...sample, clip: true, frames: [], guess, ...classified }); } catch (err: any) { console.warn(JSON.stringify({ cam: "clip_failed", error: String(err?.message ?? err).slice(0, 200) })); }
      }
      if (seen) {
        const id = await deps.events.record(h.id, c.var.device.id, "mail_seen", { seen });
        await sendPush(db, h.id, ["rosa"], MAIL_PAYLOAD(h.called, id)).catch(() => ({ sent: 0 }));
      }
      return c.json({ seen, callsToday: calls, gate: row.gate ?? null, ...(collecting ? { kept } : {}), ...(clipId !== null ? { clipId } : {}), ...(clipping && guess ? { guess } : {}) });
    })
    .post("/cam/clip/:id", deps.auth, async (c) => {
      // The small frames of a clip whose row the frames reply named: up to eight, each under the limit, this household's, once.
      const id = Number(c.req.param("id"));
      if (!Number.isInteger(id) || id <= 0) return c.json({ error: "bad_id" }, 400);
      const form = await c.req.formData();
      const frames: string[] = [];
      for (const [key, value] of form.entries()) {
        if (!/^frame\d+$/.test(key) || !(value instanceof Blob)) continue;
        if (frames.length >= CLIP_FRAMES) return c.json({ error: "too_many" }, 400);
        if (value.size > MAX_CLIP_FRAME_BYTES) return c.json({ error: "too_large" }, 413);
        frames.push(dataUrl(Buffer.from(await value.arrayBuffer())));
      }
      if (!frames.length) return c.json({ error: "no_frames" }, 400);
      const ok = await store.attach(id, c.var.household.id, frames);
      return ok ? c.json({ ok: true, frames: frames.length }) : c.json({ error: "not_found" }, 404);
    })
    .post("/cam/heartbeat", deps.auth, async (c) => {
      const b = await c.req.json().catch(() => ({}));
      const battery = Number.isInteger(b?.battery) && b.battery >= 0 && b.battery <= 100 ? b.battery : null;
      const charging = typeof b?.charging === "boolean" ? b.charging : null;
      await getDb().update(device).set({ lastSeenAt: new Date(), battery, charging }).where(eq(device.id, c.var.device.id));
      const [row] = await getDb().select({ paused: cam.paused, gate: cam.gate, frozenAt: cam.frozenAt }).from(cam).where(eq(cam.householdId, c.var.household.id)).limit(1);
      // The phone says whether its camera still gives frames. A frozen stream with a live heartbeat is "asleep" on Ana's page,
      // recorded once; the first live report clears it.
      const video = b?.video === "frozen" ? "frozen" : b?.video === "live" ? "live" : null;
      if (row && video === "frozen" && !row.frozenAt) {
        await getDb().update(cam).set({ frozenAt: new Date() }).where(eq(cam.householdId, c.var.household.id));
        await deps.events.record(c.var.household.id, c.var.device.id, "cam_frozen", {});
      } else if (row && video === "live" && row.frozenAt) {
        await getDb().update(cam).set({ frozenAt: null }).where(eq(cam.householdId, c.var.household.id));
      }
      // The gate the taps set and whether Ana keeps clips: the phone raises or lowers its motion threshold and says on screen what is kept.
      return c.json({ ok: true, paused: row?.paused ?? false, gate: row?.gate ?? null, clips: Boolean(c.var.household.keepClips) });
    });
}
