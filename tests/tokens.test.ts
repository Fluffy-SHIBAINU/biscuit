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
