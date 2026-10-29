import { afterAll, describe, expect, test } from "vitest";
import { eq } from "drizzle-orm";
import { createApp } from "../server/app.js";
import { getDb } from "../server/db.js";
import { household } from "../server/schema.js";

const EMAIL = "ana-test@biscuit.local";

test("household needs a session", async () => {
  const res = await createApp({ anaEnv: {} }).request("/api/biscuit/household", { method: "POST", body: "{}", headers: { "content-type": "application/json" } });
  expect(res.status).toBe(401);
  expect(await res.json()).toMatchObject({ error: "unauthenticated" });
});

describe.skipIf(!process.env.DATABASE_URL)("Ana's routes with the local bypass", () => {
  const app = createApp({ anaEnv: { KINDRED_AUTH_BYPASS: EMAIL } });
  const req = (path: string, init: RequestInit = {}) => app.request(path, { ...init, headers: { "content-type": "application/json", ...(init.headers as any) } });
  afterAll(async () => { await getDb().delete(household).where(eq(household.ownerEmail, EMAIL)); });

  test("no household yet is 404, then one is made", async () => {
    await getDb().delete(household).where(eq(household.ownerEmail, EMAIL));
    expect((await req("/api/biscuit/family")).status).toBe(404);
    const res = await req("/api/biscuit/household", { method: "POST", body: JSON.stringify({ seniorName: "Rosa Alvarez", called: "Rosa", relation: "daughter", living: "alone", language: "en" }) });
    expect(res.status).toBe(200);
    expect((await res.json()).id).toMatch(/^[0-9a-f-]{36}$/);
  });

  test("link/new makes a six digit code good for ten minutes", async () => {
    const before = Date.now();
    const res = await req("/api/biscuit/link/new", { method: "POST", body: JSON.stringify({ kind: "rosa" }) });
    expect(res.status).toBe(200);
    const { code, expiresAt } = await res.json();
    expect(code).toMatch(/^\d{6}$/);
    const ttl = new Date(expiresAt).getTime() - before;
    expect(ttl).toBeGreaterThan(9.5 * 60_000);
    expect(ttl).toBeLessThanOrEqual(10.1 * 60_000);
    expect((await req("/api/biscuit/link/new", { method: "POST", body: JSON.stringify({ kind: "toaster" }) })).status).toBe(400);
  });

  test("family lists the household and no letters", async () => {
    const fam = await (await req("/api/biscuit/family")).json();
    expect(fam.household).toMatchObject({ called: "Rosa", seniorName: "Rosa Alvarez" });
    expect(fam.letters).toEqual([]);
    expect(fam.devices).toEqual([]);
    expect(fam.camera.status).toBe("not_set");
  });

  test("Ana sets the usual mail hour; a zone only fills a blank, so the phone's own zone keeps winning", async () => {
    const res = await req("/api/biscuit/family/mail-time", { method: "PATCH", body: JSON.stringify({ minutes: 13 * 60, tz: "America/Chicago" }) });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, mailMinutes: 780, tz: "America/Chicago" });
    let fam = await (await req("/api/biscuit/family")).json();
    expect(fam.household).toMatchObject({ mailMinutes: 780, tz: "America/Chicago" });
    expect((await req("/api/biscuit/family/mail-time", { method: "PATCH", body: JSON.stringify({ minutes: 14 * 60, tz: "America/Denver" }) })).status).toBe(200);
    fam = await (await req("/api/biscuit/family")).json();
    expect(fam.household).toMatchObject({ mailMinutes: 840, tz: "America/Chicago" });
    expect((await req("/api/biscuit/family/mail-time", { method: "PATCH", body: JSON.stringify({ minutes: "soon" }) })).status).toBe(400);
    expect((await req("/api/biscuit/family/mail-time", { method: "PATCH", body: JSON.stringify({ minutes: 1500 }) })).status).toBe(400);
    expect((await req("/api/biscuit/family/mail-time", { method: "PATCH", body: JSON.stringify({ minutes: null }) })).status).toBe(200);
    fam = await (await req("/api/biscuit/family")).json();
    expect(fam.household.mailMinutes).toBeNull();
  });
});
