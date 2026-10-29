import { expect, test } from "vitest";
import { helpLine, lettersLine, readersLine, recentLine, saidLine } from "../src/lib/lines.js";

// The one Title Case line under each card title on Ana's page: what is true now, nothing more.
test("one line per card", () => {
  expect(readersLine(null)).toBe("No Letter Read Yet");
  expect(readersLine({ readBy: "twice" })).toBe("Last Letter Read Twice");
  expect(readersLine({ readBy: "once" })).toBe("Last Letter Read Once");
  expect(readersLine({ readBy: "single" })).toBe("Last Letter Read by One Reader");
  expect(saidLine(0)).toBe("Nothing Today");
  expect(saidLine(3)).toBeNull();
  expect(lettersLine(0)).toBe("None Yet");
  expect(lettersLine(2)).toBeNull();
  expect(recentLine(0)).toBe("Nothing Yet");
  expect(recentLine(1)).toBeNull();
  expect(helpLine({ acked: true })).toBe("Tested");
  expect(helpLine({ acked: false })).toBe("Untested");
});
