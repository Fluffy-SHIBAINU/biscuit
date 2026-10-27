import { expect, test } from "vitest";
import { Hono } from "hono";
import { hashToken, newToken } from "../server/tokens.js";
import { deviceAuth } from "../server/auth.js";

test("hash is stable and tokens differ", () => {
  const a = newToken();
  const b = newToken();
  expect(a.token).not.toBe(b.token);
  expect(hashToken(a.token)).toBe(a.hash);
  expect(a.hash).toMatch(/^[0-9a-f]{64}$/);
});

test("an unknown token is unlinked, not a crash", async () => {
  const app = new Hono().use("/x", deviceAuth({ lookup: async () => null })).get("/x", (c) => c.json({ ok: true }));
  const res = await app.request("/x", { headers: { authorization: "Bearer nope" } });
  expect(res.status).toBe(401);
  expect(await res.json()).toEqual({ error: "unlinked" });
  const none = await app.request("/x");
  expect(none.status).toBe(401);
});

import { requireKind } from "../server/auth.js";
const rosa = { device: { id: "r", kind: "rosa" } as any, household: { id: "h" } as any };
const camDev = { device: { id: "c", kind: "cam" } as any, household: { id: "h" } as any };

test("the frame route is exempt from the general device limit", async () => {
  const app = new Hono().use("*", deviceAuth({ lookup: async () => rosa, limiter: async () => false, exempt: (p) => p.endsWith("/letter/frame") })).get("/api/biscuit/letter/frame", (c) => c.json({ ok: true })).get("/x", (c) => c.json({ ok: true }));
  expect((await app.request("/api/biscuit/letter/frame", { headers: { authorization: "Bearer t" } })).status).toBe(200);
  expect((await app.request("/x", { headers: { authorization: "Bearer t" } })).status).toBe(429);
});

test("requireKind refuses the mailbox phone on Rosa's routes", async () => {
  const app = new Hono().use("*", deviceAuth({ lookup: async () => camDev })).delete("/household", requireKind("rosa"), (c) => c.json({ ok: true }));
  const res = await app.request("/household", { method: "DELETE", headers: { authorization: "Bearer t" } });
  expect(res.status).toBe(403);
  expect(await res.json()).toEqual({ error: "wrong_device" });
});
