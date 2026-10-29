import { expect, test } from "vitest";
import { DEFAULT_TZ, DUE_WINDOW_MIN, MAIL_DUE_PAYLOAD, dueNow, localParts, mailTimeLabel, validTz, type ChimeHousehold } from "../server/chime.js";

const h = (over: Partial<ChimeHousehold> = {}): ChimeHousehold => ({ id: "h1", called: "Rosa", mailMinutes: 13 * 60, tz: "America/New_York", lastDueAt: null, lastSeenAt: null, ...over });
const at = (iso: string) => new Date(iso);

test("localParts gives the day and minutes after midnight in the zone, through daylight time and standard time", () => {
  expect(localParts(at("2026-10-29T17:05:00Z"), "America/New_York")).toEqual({ day: "2026-10-29", minutes: 13 * 60 + 5 });
  expect(localParts(at("2026-10-29T17:05:00Z"), "America/Los_Angeles")).toEqual({ day: "2026-10-29", minutes: 10 * 60 + 5 });
  expect(localParts(at("2026-12-01T17:05:00Z"), "America/New_York")).toEqual({ day: "2026-12-01", minutes: 12 * 60 + 5 });
  expect(localParts(at("2026-10-29T03:30:00Z"), "America/New_York")).toEqual({ day: "2026-10-28", minutes: 23 * 60 + 30 });
});

test("validTz accepts an IANA zone and nothing else", () => {
  expect(validTz("America/Chicago")).toBe("America/Chicago");
  expect(validTz("Mars/Olympus")).toBeNull();
  expect(validTz(42)).toBeNull();
  expect(validTz("")).toBeNull();
  expect(validTz("A".repeat(65))).toBeNull();
  expect(DEFAULT_TZ).toBe("America/New_York");
});

test("due from the hour for ninety minutes, local to the household", () => {
  expect(DUE_WINDOW_MIN).toBe(90);
  expect(dueNow(h(), at("2026-10-29T16:59:00Z"))).toBe(false);
  expect(dueNow(h(), at("2026-10-29T17:00:00Z"))).toBe(true);
  expect(dueNow(h(), at("2026-10-29T18:29:00Z"))).toBe(true);
  expect(dueNow(h(), at("2026-10-29T18:30:00Z"))).toBe(false);
  expect(dueNow(h({ tz: "America/Los_Angeles" }), at("2026-10-29T17:00:00Z"))).toBe(false);
  expect(dueNow(h({ tz: "America/Los_Angeles" }), at("2026-10-29T20:00:00Z"))).toBe(true);
});

test("never twice a day, never on a day the mailbox phone already saw mail, never when no hour is set", () => {
  expect(dueNow(h({ lastDueAt: at("2026-10-29T17:01:00Z") }), at("2026-10-29T17:30:00Z"))).toBe(false);
  expect(dueNow(h({ lastDueAt: at("2026-10-28T17:01:00Z") }), at("2026-10-29T17:30:00Z"))).toBe(true);
  expect(dueNow(h({ lastSeenAt: at("2026-10-29T15:00:00Z") }), at("2026-10-29T17:30:00Z"))).toBe(false);
  expect(dueNow(h({ lastSeenAt: at("2026-10-29T03:30:00Z") }), at("2026-10-29T17:30:00Z"))).toBe(true);
  expect(dueNow(h({ mailMinutes: null }), at("2026-10-29T17:30:00Z"))).toBe(false);
});

test("a household with no zone, or a bad one, is read in Eastern time", () => {
  expect(dueNow(h({ tz: null }), at("2026-10-29T17:00:00Z"))).toBe(true);
  expect(dueNow(h({ tz: "Mars/Olympus" }), at("2026-10-29T17:00:00Z"))).toBe(true);
  expect(dueNow(h({ tz: "Mars/Olympus" }), at("2026-10-29T16:00:00Z"))).toBe(false);
});

test("the hour is spoken like a clock", () => {
  expect(mailTimeLabel(8 * 60)).toBe("8 AM");
  expect(mailTimeLabel(13 * 60)).toBe("1 PM");
  expect(mailTimeLabel(13 * 60 + 30)).toBe("1:30 PM");
  expect(mailTimeLabel(12 * 60)).toBe("12 PM");
  expect(mailTimeLabel(0)).toBe("12 AM");
  expect(mailTimeLabel(18 * 60)).toBe("6 PM");
});

test("the chime payload names the hour as a usual time, not a sighting", () => {
  const p = MAIL_DUE_PAYLOAD("Rosa", 7);
  expect(p.kind).toBe("mail_due");
  expect(p.url).toBe("/mail?due=1");
  expect(p.eventId).toBe(7);
  expect(p.body).toContain("Rosa");
  expect(p.body).toMatch(/usually/);
  expect(p.body).not.toMatch(/got mail/i);
});
