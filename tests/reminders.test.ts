import { expect, test } from "vitest";
import { REMINDER_PAYLOAD, REMINDER_WINDOW_MIN, dueReminder, parseTime } from "../server/reminders.js";

const r = (over: Record<string, unknown> = {}) => ({ id: 1, label: "pills", minutes: 8 * 60, days: null, lastFiredAt: null, ...over });
const at = (iso: string) => new Date(iso);

test("parseTime reads a clock time into minutes after midnight", () => {
  expect(parseTime("08:00")).toBe(480);
  expect(parseTime("8:00 AM")).toBe(480);
  expect(parseTime("12:30 PM")).toBe(750);
  expect(parseTime("12:30 AM")).toBe(30);
  expect(parseTime("9 pm")).toBe(21 * 60);
  expect(parseTime("25:00")).toBeNull();
  expect(parseTime("soon")).toBeNull();
});

test("a reminder is due inside ninety minutes after its time, once a day, on its days, in the household's zone", () => {
  expect(REMINDER_WINDOW_MIN).toBe(90);
  expect(dueReminder(r(), at("2026-10-29T11:59:00Z"), "America/New_York")).toBe(false);
  expect(dueReminder(r(), at("2026-10-29T12:00:00Z"), "America/New_York")).toBe(true);
  expect(dueReminder(r(), at("2026-10-29T13:29:00Z"), "America/New_York")).toBe(true);
  expect(dueReminder(r(), at("2026-10-29T13:30:00Z"), "America/New_York")).toBe(false);
  expect(dueReminder(r({ lastFiredAt: at("2026-10-29T12:01:00Z") }), at("2026-10-29T12:10:00Z"), "America/New_York")).toBe(false);
  expect(dueReminder(r({ lastFiredAt: at("2026-10-28T12:01:00Z") }), at("2026-10-29T12:10:00Z"), "America/New_York")).toBe(true);
  expect(dueReminder(r({ days: ["mon", "wed", "fri"] }), at("2026-10-29T12:10:00Z"), "America/New_York")).toBe(false); // a Thursday
  expect(dueReminder(r({ days: ["thu"] }), at("2026-10-29T12:10:00Z"), "America/New_York")).toBe(true);
});

test("the reminder chime names the thing, not a dose", () => {
  const p = REMINDER_PAYLOAD("Rosa", "pills", 7);
  expect(p.kind).toBe("reminder");
  expect(p.body).toBe("Time for your pills, Rosa.");
  expect(p.url).toBe("/");
});

// Spoken times: noon, midnight, "eight o'clock", "eight tonight", "8 in the morning".
test("parseTime reads the ways people say a time", () => {
  expect(parseTime("noon")).toBe(720);
  expect(parseTime("midnight")).toBe(0);
  expect(parseTime("eight o'clock")).toBe(480);
  expect(parseTime("8 o'clock in the evening")).toBe(1200);
  expect(parseTime("eight tonight")).toBe(1200);
  expect(parseTime("8 in the morning")).toBe(480);
  expect(parseTime("half past seven")).toBe(450);
  expect(parseTime("later")).toBeNull();
});

// The tick runs every 10 minutes and can run late; a reminder is due for 90 minutes after its time, once a day.
test("a reminder stays due for ninety minutes so a late tick still chimes it once", () => {
  const tz = "America/New_York";
  const at = (h: number, m: number) => { const d = new Date("2026-10-30T12:00:00Z"); d.setUTCHours(h + 4, m, 0, 0); return d; };
  const r = { id: 1, label: "pills", minutes: 8 * 60, days: null, lastFiredAt: null };
  expect(dueReminder(r, at(8, 0), tz)).toBe(true);
  expect(dueReminder(r, at(9, 20), tz)).toBe(true);
  expect(dueReminder(r, at(9, 31), tz)).toBe(false);
  expect(dueReminder({ ...r, lastFiredAt: at(8, 5) }, at(9, 0), tz)).toBe(false);
});

test("parseTime: no space before pm, twelve at night, word minutes, quarter past", () => {
  expect(parseTime("8pm")).toBe(1200);
  expect(parseTime("8:30pm")).toBe(1230);
  expect(parseTime("12 tonight")).toBe(0);
  expect(parseTime("twelve at night")).toBe(0);
  expect(parseTime("12 pm")).toBe(720);
  expect(parseTime("eight thirty")).toBe(510);
  expect(parseTime("quarter past seven")).toBe(435);
  expect(parseTime("seven fifteen in the evening")).toBe(1155);
});
