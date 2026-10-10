import test from "node:test";
import assert from "node:assert/strict";
import { safeUrl } from "./safeUrl.js";

test("http(s) URLs pass through unchanged", () => {
  const wp = "https://en.wikipedia.org/wiki/Suez_Crisis";
  assert.equal(safeUrl(wp), wp);
  assert.equal(safeUrl("http://example.org/a?b=1#c"), "http://example.org/a?b=1#c");
  assert.equal(safeUrl("HTTPS://en.wikipedia.org/w/index.php?oldid=1"), "HTTPS://en.wikipedia.org/w/index.php?oldid=1");
});

test("other schemes, relative and malformed values give null", () => {
  for (const bad of [
    "javascript:alert(1)",
    " javascript:alert(1)",
    "JaVaScRiPt:alert(1)",
    "data:text/html,<b>x</b>",
    "vbscript:x",
    "/wiki/Suez_Crisis",
    "//evil.example",
    "not a url",
    "",
    null,
    undefined,
    42,
  ]) {
    assert.equal(safeUrl(bad), null, String(bad));
  }
});
