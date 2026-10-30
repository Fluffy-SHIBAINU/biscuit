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

test("a reminder is due inside a quarter hour after its time, once a day, on its days, in the household's zone", () => {
  expect(REMINDER_WINDOW_MIN).toBe(15);
  expect(dueReminder(r(), at("2026-10-29T11:59:00Z"), "America/New_York")).toBe(false);
  expect(dueReminder(r(), at("2026-10-29T12:00:00Z"), "America/New_York")).toBe(true);
  expect(dueReminder(r(), at("2026-10-29T12:14:00Z"), "America/New_York")).toBe(true);
  expect(dueReminder(r(), at("2026-10-29T12:15:00Z"), "America/New_York")).toBe(false);
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
