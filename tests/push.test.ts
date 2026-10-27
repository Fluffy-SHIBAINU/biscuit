import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { eq } from "drizzle-orm";
import { getDb } from "../server/db.js";
import { sendPush, urlBase64ToUint8Array } from "../server/push.js";
import { device, household } from "../server/schema.js";

const EMAIL = "push-test@biscuit.local";

test("urlBase64ToUint8Array decodes a VAPID key", () => {
  const bytes = urlBase64ToUint8Array("BAQI");
  expect(Array.from(bytes)).toEqual([4, 4, 8]);
});

describe.skipIf(!process.env.DATABASE_URL)("sendPush", () => {
  let householdId = "";
  let deviceId = "";
  beforeAll(async () => {
    const db = getDb();
    await db.delete(household).where(eq(household.ownerEmail, EMAIL));
    const [h] = await db.insert(household).values({ ownerEmail: EMAIL, seniorName: "Rosa", called: "Rosa" }).returning();
    householdId = h.id;
    const [d] = await db.insert(device).values({ householdId, kind: "rosa", label: "Rosa's phone", pushSubscription: { endpoint: "https://push.example/1", keys: { p256dh: "x", auth: "y" } } }).returning();
    deviceId = d.id;
  });
  afterAll(async () => { await getDb().delete(household).where(eq(household.ownerEmail, EMAIL)); });

  test("delivers to the household's phones of the given kinds", async () => {
    const sent: string[] = [];
    const r = await sendPush(getDb(), householdId, ["rosa"], { title: "Biscuit", body: "You've got mail, Rosa.", url: "/mail" }, { send: async (sub: any) => { sent.push(sub.endpoint); } });
    expect(r).toEqual({ sent: 1 });
    expect(sent).toEqual(["https://push.example/1"]);
    expect(await sendPush(getDb(), householdId, ["ana"], { title: "x", body: "y", url: "/" }, { send: async () => {} })).toEqual({ sent: 0 });
  });

  test("drops a dead subscription", async () => {
    const r = await sendPush(getDb(), householdId, ["rosa"], { title: "Biscuit", body: "x", url: "/" }, { send: async () => { throw Object.assign(new Error("gone"), { statusCode: 410 }); } });
    expect(r).toEqual({ sent: 0 });
    const [d] = await getDb().select().from(device).where(eq(device.id, deviceId));
    expect(d.pushSubscription).toBeNull();
  });
});
