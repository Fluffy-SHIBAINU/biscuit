import { and, eq, inArray, isNotNull } from "drizzle-orm";
import webpush from "web-push";
import type { Db } from "./db.js";
import { device, type DeviceKind } from "./schema.js";

export type PushPayload = { title: string; body: string; url: string; eventId?: number; kind?: string };
export type Sender = (subscription: any, body: string) => Promise<unknown>;

let configured = false;
function vapid(): void {
  if (configured) return;
  const pub = process.env.VAPID_PUBLIC_KEY, priv = process.env.VAPID_PRIVATE_KEY;
  if (!pub || !priv) throw new Error("VAPID keys are not set");
  webpush.setVapidDetails(process.env.VAPID_SUBJECT || "mailto:hello@kindred-ai.dev", pub, priv);
  configured = true;
}

export function publicKey(): string {
  return process.env.VAPID_PUBLIC_KEY ?? "";
}

export function urlBase64ToUint8Array(s: string): Uint8Array {
  return new Uint8Array(Buffer.from(s.replace(/-/g, "+").replace(/_/g, "/"), "base64"));
}

const defaultSend: Sender = async (subscription, body) => {
  vapid();
  await webpush.sendNotification(subscription, body, { TTL: 600, urgency: "high" });
};

/** One notification to every subscribed device of the given kinds. A 404 or 410 from the push service forgets that subscription. */
export async function sendPush(db: Db, householdId: string, kinds: DeviceKind[], payload: PushPayload, deps: { send?: Sender } = {}): Promise<{ sent: number }> {
  const send = deps.send ?? defaultSend;
  const rows = await db.select().from(device).where(and(eq(device.householdId, householdId), inArray(device.kind, kinds), isNotNull(device.pushSubscription)));
  let sent = 0;
  const body = JSON.stringify(payload);
  for (const row of rows) {
    try {
      await send(row.pushSubscription, body);
      sent++;
    } catch (err: any) {
      const status = err?.statusCode ?? err?.status;
      if (status === 404 || status === 410) await db.update(device).set({ pushSubscription: null }).where(eq(device.id, row.id));
      else console.log(JSON.stringify({ push: "failed", status, device: row.id }));
    }
  }
  return { sent };
}

export const LOOK_PAYLOAD = (sender: string, letterId: string): PushPayload => ({ title: "Biscuit", body: `Ana would like another look at the letter from ${sender}. Tap to show it again.`, url: "/letter", kind: "look_requested", ...({ letterId } as object) });
export const MAIL_PAYLOAD = (called: string, eventId?: number): PushPayload => ({ title: "Biscuit", body: `You've got mail, ${called}. Tap to hear.`, url: "/mail", eventId, kind: "mail_seen" });
export const HELP_PAYLOAD = (called: string, eventId: number, test: boolean): PushPayload => ({
  title: test ? "Biscuit · test" : "Biscuit · Help",
  body: test ? `Test from ${called}'s phone. Tap so Biscuit knows this page got it.` : `${called} pressed Help. Her phone is calling 911.`,
  url: "/ana",
  eventId,
  kind: test ? "help_test" : "help",
});
