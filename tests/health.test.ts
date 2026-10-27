import { expect, test } from "vitest";
import { createApp } from "../server/app.js";

test("health answers", async () => {
  const res = await createApp().request("/api/biscuit/health");
  expect(res.status).toBe(200);
  expect(await res.json()).toMatchObject({ ok: true });
});
