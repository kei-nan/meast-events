import test from "node:test";
import assert from "node:assert/strict";
import { MAX_ISSUE_URL, REPO, TRUNCATED_NOTE, issueUrl } from "./githubIssue.js";
import { reportBody, reportUrl, REPORT_TAIL } from "./eventReport.js";

const params = (url) => new URL(url).searchParams;

test("issueUrl: title, body lines, tail and label, encoded", () => {
  const url = issueUrl({ title: "A & B?", body: ["one", "two #3"], tail: ["", "Why?"], labels: "framing-review" });
  assert.ok(url.startsWith(`${REPO}/issues/new?`));
  const p = params(url);
  assert.equal(p.get("title"), "A & B?");
  assert.equal(p.get("body"), "one\ntwo #3\n\nWhy?");
  assert.equal(p.get("labels"), "framing-review");
  assert.equal(params(issueUrl({ title: "x", body: "a\nb" })).get("body"), "a\nb");
  assert.equal(params(issueUrl({ title: "x", body: [] })).has("labels"), false);
});

test("issueUrl: a body too long for a link loses whole lines from its end; the tail stays", () => {
  const body = Array.from({ length: 400 }, (_, i) => `line ${i} ${"x".repeat(30)}`);
  const url = issueUrl({ title: "t", body, tail: ["", "What is wrong?"], labels: "l" });
  assert.ok(url.length <= MAX_ISSUE_URL, String(url.length));
  const text = params(url).get("body");
  assert.ok(text.startsWith("line 0 "));
  assert.ok(text.endsWith(`\n\n${TRUNCATED_NOTE}\n\nWhat is wrong?`));
  // Whole lines only.
  assert.ok(text.split("\n").filter((l) => l.startsWith("line ")).every((l) => l.endsWith("x".repeat(30))));
});

test("issueUrl: one very long line is cut by characters, never through a surrogate pair", () => {
  const url = issueUrl({ title: "t", body: ["😀".repeat(5000)] }, 2000);
  assert.ok(url.length <= 2000);
  const text = params(url).get("body");
  assert.match(text, /^(😀)+…\n\n\(Shortened/);
});

const EVENT = {
  id: "taif-like-1989",
  title: "Some event",
  wikidata_qid: "Q1",
  wikipedia_url: "https://en.wikipedia.org/wiki/Some_event",
  wikipedia_revid: 123456,
  extract_retrieved_at: "2026-11-04T10:00:00Z",
  date_start: "1989-10-22",
  date_precision: "day",
  date_end: "1989-11-05",
  countries: ["Lebanon", "Saudi Arabia"],
  location_quality: "approximate",
  approximate_reason: "rounded",
  coordinates: { lat: 21.3, lon: 40.4 },
  coordinate_source: "wikidata",
  category: "diplomacy",
};

test("reportBody: the record's id, item, revision and key fields as stored", () => {
  assert.deepEqual(reportBody(EVENT), [
    "Event: Some event (taif-like-1989)",
    "Page: https://middleeast.events/event/taif-like-1989",
    "Wikidata: Q1",
    "Wikipedia: https://en.wikipedia.org/wiki/Some_event",
    "Wikipedia revision of the shown text: 123456",
    "Text retrieved: 2026-11-04",
    "Dates: 1989-10-22 (day precision) to 1989-11-05",
    "Countries: Lebanon, Saudi Arabia",
    "Location: approximate; reason: rounded; lat 21.3, lon 40.4; from wikidata",
    "Category: diplomacy",
  ]);
  const bare = reportBody({ id: "x", title: "X", location_quality: "none", coordinates: null, countries: [] });
  assert.ok(bare.includes("Wikidata: none"));
  assert.ok(bare.includes("Wikipedia revision of the shown text: not recorded"));
  assert.ok(bare.includes("Dates: unknown"));
  assert.ok(bare.includes("Countries: none"));
  assert.ok(bare.includes("Location: none"));
});

test("reportUrl: a prefilled issue within the length limit, with the question at the end", () => {
  const url = reportUrl(EVENT);
  const p = params(url);
  assert.equal(p.get("title"), "Problem with an entry: Some event");
  assert.equal(p.get("body"), [...reportBody(EVENT), ...REPORT_TAIL].join("\n"));
  assert.equal(p.has("labels"), false);
  const long = reportUrl({ ...EVENT, countries: Array.from({ length: 2000 }, (_, i) => `Country ${i}`) });
  assert.ok(long.length <= MAX_ISSUE_URL);
  assert.ok(params(long).get("body").endsWith(REPORT_TAIL.join("\n")));
});
