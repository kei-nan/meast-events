import test from "node:test";
import assert from "node:assert/strict";
import { MAX_STATIC_REDIRECTS, checkRedirectsText, redirectProblems, redirectsFile } from "./redirects.mjs";

const IDS = new Set(["treaty-of-sevres", "suez-crisis"]);

test("a renamed id redirects with a 301 to its new page", () => {
  const map = { "treaty-of-s-vres": "treaty-of-sevres", "suez-1956": "suez-crisis" };
  assert.deepEqual(redirectProblems(map, IDS), []);
  const text = redirectsFile(map);
  assert.match(text, /^# Generated/);
  assert.deepEqual(
    text.split("\n").filter((l) => l && !l.startsWith("#")),
    ["/event/suez-1956 /event/suez-crisis 301", "/event/treaty-of-s-vres /event/treaty-of-sevres 301"]
  );
  assert.deepEqual(checkRedirectsText(text, IDS), []);
});

test("a redirect from a live event, to a missing one, a chain or a malformed id is refused", () => {
  assert.match(redirectProblems({ "suez-crisis": "treaty-of-sevres" }, IDS)[0], /still an event/);
  assert.match(redirectProblems({ old: "gone" }, IDS)[0], /gone is not an event/);
  assert.match(redirectProblems({ a: "b", b: "suez-crisis" }, IDS)[0], /a chain/);
  assert.match(redirectProblems({ "../x": "suez-crisis" }, IDS)[0], /not a valid event id/);
  assert.match(redirectProblems({ old: 5 }, IDS)[0], /not a valid event id/);
  assert.match(redirectProblems([], IDS)[0], /not an object/);
  const many = Object.fromEntries(Array.from({ length: MAX_STATIC_REDIRECTS + 1 }, (_, i) => [`old-${i}`, "suez-crisis"]));
  assert.match(redirectProblems(many, IDS).at(-1), /the host allows 2000/);
});

test("a built _redirects with a foreign line, a duplicate or a stale target is reported", () => {
  assert.match(checkRedirectsText("/event/a /elsewhere 301\n", IDS)[0], /unexpected line/);
  assert.match(checkRedirectsText("/event/a /event/suez-crisis 302\n", IDS)[0], /unexpected line/);
  assert.match(checkRedirectsText("/event/a /event/suez-crisis 301\n/event/a /event/suez-crisis 301\n", IDS)[0], /redirected twice/);
  assert.match(checkRedirectsText("/event/a /event/gone 301\n", IDS)[0], /gone is not an event/);
  assert.deepEqual(checkRedirectsText("# only a comment\n", IDS), []);
});
