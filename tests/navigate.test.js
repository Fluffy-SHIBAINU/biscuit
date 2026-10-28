import { afterEach, beforeEach, expect, test } from "vitest";

function fakeWindow(pathname, search = "") {
  const location = { pathname, search };
  return {
    location,
    history: { pushState: (_state, _title, url) => { const u = new URL(url, "http://local"); location.pathname = u.pathname; location.search = u.search; } },
    addEventListener() {},
    removeEventListener() {},
  };
}

let nav;
beforeEach(async () => { globalThis.window = fakeWindow("/ana/link"); nav = await import("../src/lib/navigate.js"); });
afterEach(() => { delete globalThis.window; });

test("a navigation that changes only the query string changes the search snapshot", () => {
  nav.navigate("/ana/link?kind=cam");
  expect(nav.getPath()).toBe("/ana/link");
  expect(nav.getSearch()).toBe("?kind=cam");
});

test("the path snapshot leaves the query string out, so route matching is unchanged", () => {
  nav.navigate("/mail?from=home");
  expect(nav.getPath()).toBe("/mail");
});
