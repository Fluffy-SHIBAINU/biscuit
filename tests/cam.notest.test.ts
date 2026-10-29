import { expect, test } from "vitest";
import { createApp } from "../server/app.js";

// The envelope test is gone: once the box is set the phone watches, and nothing asks anyone to open and close a lid.
test("the envelope test routes no longer exist", async () => {
  expect((await createApp().request("/api/biscuit/cam/test", { method: "POST", headers: { "content-type": "application/json" }, body: "{}" })).status).toBe(404);
  expect((await createApp({ anaEnv: {} }).request("/api/biscuit/cam/test/request", { method: "POST" })).status).toBe(404);
});
