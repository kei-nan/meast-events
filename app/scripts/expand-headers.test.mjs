// Tests for expand-headers.mjs: marked splat rules get one immutable rule per
// existing file or hashed folder, within the host's rule limit.
import test from "node:test";
import assert from "node:assert/strict";
import { EXPANDED, IMMUTABLE, MARKER, expandHeaders, expandPattern, hasMarker, parseRules } from "./expand-headers.mjs";

// A fake dist/: {folder: {name: true (file) | {} (folder)}}.
const lister = (tree) => (dir) =>
  Object.entries(tree[dir] ?? {}).map(([name, v]) => ({ name, isDirectory: () => typeof v === "object" }));

const TREE = {
  assets: { "index-AbCd_-12.js": true, "MapView-Zz9_8yX7.css": true },
  "data/events": { "v.0123456789ab": {}, "meta.json": true },
};

const TEMPLATE = [
  "/*",
  "  X-Content-Type-Options: nosniff",
  "",
  `# A comment that mentions ${MARKER} is not a marker.`,
  MARKER,
  "/assets/*",
  "  Cache-Control: public, max-age=0, must-revalidate",
  "",
  "/data/*",
  "  Cache-Control: public, max-age=3600",
  "",
  MARKER,
  "/data/events/v.*",
  "  ! Cache-Control",
  "  Cache-Control: public, max-age=0, must-revalidate",
  "",
].join("\n");

test("a file gets an exact rule, a hashed folder a folder rule; other names are left out", () => {
  assert.deepEqual(expandPattern("/assets/*", lister(TREE)), ["/assets/MapView-Zz9_8yX7.css", "/assets/index-AbCd_-12.js"]);
  assert.deepEqual(expandPattern("/data/events/v.*", lister(TREE)), ["/data/events/v.0123456789ab/*"]);
  assert.deepEqual(expandPattern("/nothing/*", lister(TREE)), []);
});

test("only a path ending in its one splat can be marked, and names that would be patterns are refused", () => {
  assert.throws(() => expandPattern("/assets/*.js", lister(TREE)), /must be a path ending in its only "\*"/);
  assert.throws(() => expandPattern("/a/*/b/*", lister(TREE)), /must be a path/);
  assert.throws(() => expandPattern("/assets/*", lister({ assets: { "a:b.js": true } })), /cannot write a rule for \/assets\/a:b\.js/);
});

test("each rule is added right after its splat, replacing the splat's Cache-Control", () => {
  const { text, added, kept } = expandHeaders(TEMPLATE, lister(TREE));
  assert.equal(added, 3);
  assert.deepEqual(kept, []);
  const rules = parseRules(text);
  assert.deepEqual(
    rules.map((r) => r.pattern),
    ["/*", "/assets/*", "/assets/MapView-Zz9_8yX7.css", "/assets/index-AbCd_-12.js", "/data/*", "/data/events/v.*", "/data/events/v.0123456789ab/*"]
  );
  // Workers applies matching rules in file order: the per-file rule detaches the
  // splat's value, then sets its own.
  assert.deepEqual(rules[3].headers, ["! Cache-Control", `Cache-Control: ${IMMUTABLE}`]);
  // The splats keep their header for a missing file.
  assert.deepEqual(rules[1].headers, ["Cache-Control: public, max-age=0, must-revalidate"]);
  // Marker lines become plain comments, so the output is not expanded twice; a
  // comment that only mentions the marker is left as it was.
  assert.ok(!hasMarker(text));
  assert.equal(text.split("\n").filter((l) => l === EXPANDED).length, 2);
  assert.ok(text.includes(`# A comment that mentions ${MARKER} is not a marker.`));
});

test("a marked rule whose files do not fit the rule limit stays a splat; smaller ones go first", () => {
  // 4 rules in the template, room for 2 more: the events folder (1) fits, then the assets (2) do not.
  const { text, added, kept } = expandHeaders(TEMPLATE, lister(TREE), 6);
  assert.equal(added, 1);
  assert.deepEqual(kept, ["/assets/*"]);
  assert.ok(parseRules(text).length <= 6);
  assert.ok(!parseRules(text).some((r) => r.pattern.startsWith("/assets/index-")));
});

test("a marker must be followed by a rule", () => {
  assert.throws(() => expandHeaders(`${MARKER}\n\n/assets/*\n`, lister(TREE)), /on line 1 is not followed by a rule/);
});

test("parseRules reads patterns and their indented headers, skipping comments and blank lines", () => {
  assert.deepEqual(parseRules("# c\n/a\n  H: 1\n\n  # indented comment\n/b/*\n  ! H\n"), [
    { pattern: "/a", headers: ["H: 1"] },
    { pattern: "/b/*", headers: ["! H"] },
  ]);
});
