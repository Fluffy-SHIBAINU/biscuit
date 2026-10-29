import { expect, test } from "vitest";
import { MAIL_TIMES, mailSourceLabel, mailTimeLabel, mailTimeLine, todaysMailLine } from "../src/lib/mailtime.js";

test("Ana picks from eight in the morning to six in the evening, on the hour", () => {
  expect(MAIL_TIMES).toHaveLength(11);
  expect(MAIL_TIMES[0]).toBe(8 * 60);
  expect(MAIL_TIMES[MAIL_TIMES.length - 1]).toBe(18 * 60);
  expect(MAIL_TIMES.every((m, i) => i === 0 || m - MAIL_TIMES[i - 1] === 60)).toBe(true);
});

test("the label reads like a clock, the same on the phone as on the server", () => {
  expect(mailTimeLabel(8 * 60)).toBe("8 AM");
  expect(mailTimeLabel(13 * 60)).toBe("1 PM");
  expect(mailTimeLabel(13 * 60 + 30)).toBe("1:30 PM");
  expect(mailTimeLabel(12 * 60)).toBe("12 PM");
});

test("the Today's mail line: a sighting today, else the usual hour when Ana set one", () => {
  const now = new Date("2026-10-29T17:30:00");
  expect(todaysMailLine({ seenAt: new Date("2026-10-29T13:12:00").toISOString(), now, mailMinutes: 780 })).toMatch(/^The mail came at 1:12\sPM\.$/);
  expect(todaysMailLine({ seenAt: new Date("2026-10-28T13:12:00").toISOString(), now, mailMinutes: 780 })).toBe("No mail seen yet today. It usually comes about 1 PM.");
  expect(todaysMailLine({ seenAt: null, now, mailMinutes: null })).toBe("No mail seen yet today.");
});

test("the small line under it says who is watching", () => {
  expect(mailSourceLabel({ hasCam: true, mailMinutes: null })).toBe("Seen by the mailbox phone · no pictures kept");
  expect(mailSourceLabel({ hasCam: null, mailMinutes: null })).toBe("Seen by the mailbox phone · no pictures kept");
  expect(mailSourceLabel({ hasCam: false, mailMinutes: 780 })).toBe("No mailbox phone · Biscuit chimes about the usual time");
  expect(mailSourceLabel({ hasCam: false, mailMinutes: null })).toBe("No mailbox phone · tap below when the mail comes");
});

// The one line under the Mail Time card's title on Ana's page.
test("mailTimeLine", () => {
  expect(mailTimeLine(null)).toBe("No Chime Set");
  expect(mailTimeLine(undefined)).toBe("No Chime Set");
  expect(mailTimeLine(15 * 60)).toBe("Usual Mail Time 3 PM");
  expect(mailTimeLine(9 * 60 + 30)).toBe("Usual Mail Time 9:30 AM");
});
