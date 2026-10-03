import test from "node:test";
import assert from "node:assert/strict";
import { detectTitleChange, checkFormerTitle, applyTitleChanges, titleReport } from "./title-refresh.js";

const gaza = () => ({
  id: "2023-israel-hamas-war",
  title: "2023 Israel–Hamas war",
  wikidata_qid: "Q122962941",
  wikipedia_url: "https://en.wikipedia.org/wiki/Gaza_war",
  review_reasons: [],
  needs_review: false,
});
const lead = (over = {}) => ({
  title: "Gaza war",
  url: "https://en.wikipedia.org/wiki/Gaza_war",
  pageid: 75139393,
  wikibase_item: "Q122962941",
  redirected_from: null,
  redirect_fragment: null,
  ...over,
});

test("detectTitleChange: unchanged title and URL -> null", () => {
  const e = { ...gaza(), title: "Gaza war" };
  assert.equal(detectTitleChange(e, lead()), null);
});

test("detectTitleChange: URL-encoding/underscore differences alone are not a change", () => {
  const e = { id: "x", title: "Iran–Iraq War", wikidata_qid: "Q1", wikipedia_url: "https://en.wikipedia.org/wiki/Iran%E2%80%93Iraq_War" };
  assert.equal(detectTitleChange(e, lead({ title: "Iran–Iraq War", url: "https://en.wikipedia.org/wiki/Iran%E2%80%93Iraq_War", wikibase_item: "Q1" })), null);
});

test("detectTitleChange: stored URL current but title stale (the Gaza war case)", () => {
  const c = detectTitleChange(gaza(), lead());
  assert.equal(c.kind, "title_stale");
  assert.equal(c.hold, null);
  assert.equal(c.old_title, "2023 Israel–Hamas war");
  assert.equal(c.new_title, "Gaza war");
  assert.equal(c.url_update, false);
  assert.equal(c.new_url, gaza().wikipedia_url);
  assert.equal(c.id, "2023-israel-hamas-war");
});

test("detectTitleChange: stored URL redirects to a renamed article -> title and URL updated", () => {
  const e = { ...gaza(), wikipedia_url: "https://en.wikipedia.org/wiki/2023_Israel%E2%80%93Hamas_war" };
  const c = detectTitleChange(e, lead({ redirected_from: "2023 Israel–Hamas war" }));
  assert.equal(c.kind, "renamed_redirect");
  assert.equal(c.url_update, true);
  assert.equal(c.new_url, "https://en.wikipedia.org/wiki/Gaza_war");
  assert.equal(c.redirected_from, "2023 Israel–Hamas war");
});

test("detectTitleChange: title already current, URL a redirect -> url_only", () => {
  const e = { ...gaza(), title: "Gaza war", wikipedia_url: "https://en.wikipedia.org/wiki/Israel%E2%80%93Hamas_war" };
  const c = detectTitleChange(e, lead({ redirected_from: "Israel–Hamas war" }));
  assert.equal(c.kind, "url_only");
  assert.equal(c.new_title, c.old_title);
  assert.equal(c.url_update, true);
});

test("detectTitleChange: holds instead of proposing", () => {
  assert.equal(detectTitleChange(gaza(), null).hold, "lead_missing");
  const sec = detectTitleChange(gaza(), lead({ title: "Gaza–Israel conflict", redirected_from: "2023 Israel–Hamas war", redirect_fragment: "2023 war" }));
  assert.equal(sec.hold, "section_redirect");
  const other = detectTitleChange(gaza(), lead({ title: "Gaza–Israel conflict", wikibase_item: "Q999", redirected_from: "X" }));
  assert.equal(other.hold, "qid_mismatch");
  // an event without a QID cannot be checked against the article's item, so it is not held for that
  assert.equal(detectTitleChange({ ...gaza(), wikidata_qid: null }, lead({ wikibase_item: "Q999" })).hold, null);
});

test("checkFormerTitle: a stale title stands only if Wikipedia redirects it to the same article", () => {
  const c = detectTitleChange(gaza(), lead());
  // "2023 Israel–Hamas war" redirects to the Gaza war page: a real rename
  const ok = checkFormerTitle(c, lead({ redirected_from: "2023 Israel–Hamas war" }));
  assert.equal(ok.hold, null);
  assert.equal(ok.old_title_redirects_here, true);
  // hand-picked label whose URL is a broader article
  const jordan = { id: "jordanian-independence", title: "Jordanian independence", wikidata_qid: "Q2", wikipedia_url: "https://en.wikipedia.org/wiki/History_of_Jordan" };
  const jc = detectTitleChange(jordan, lead({ title: "History of Jordan", url: jordan.wikipedia_url, pageid: 1, wikibase_item: "Q2" }));
  assert.equal(jc.kind, "title_stale");
  assert.equal(checkFormerTitle(jc, null).hold, "title_not_redirected_here");
  assert.equal(checkFormerTitle(jc, { title: "Jordan", pageid: 2 }).hold, "title_not_redirected_here");
  assert.equal(checkFormerTitle(jc, { title: "History of Jordan", pageid: 1, redirect_fragment: "Independence" }).hold, "title_not_redirected_here");
  // other kinds and held entries pass through untouched
  const r = { ...c, kind: "renamed_redirect" };
  assert.equal(checkFormerTitle(r, null), r);
  assert.equal(checkFormerTitle(null, null), null);
});

test("applyTitleChanges: applies title/URL, drops the moot flag, never touches ids", () => {
  const e = { ...gaza(), review_reasons: ['title_differs_from_article: record title "x"', "part_of: y"], needs_review: true };
  const other = { id: "six-day-war", title: "Six-Day War", wikipedia_url: "https://en.wikipedia.org/wiki/Six-Day_War" };
  const events = [e, other];
  const ch = { ...detectTitleChange(gaza(), lead()), url_update: true, new_url: "https://en.wikipedia.org/wiki/Gaza_war_(2023)" };
  const r = applyTitleChanges(events, [ch]);
  assert.deepEqual(r.applied, ["2023-israel-hamas-war"]);
  assert.equal(e.id, "2023-israel-hamas-war");
  assert.equal(e.title, "Gaza war");
  assert.equal(e.wikipedia_url, "https://en.wikipedia.org/wiki/Gaza_war_(2023)");
  assert.deepEqual(e.review_reasons, ["part_of: y"]);
  assert.equal(e.needs_review, true);
  assert.equal(other.title, "Six-Day War");
});

test("applyTitleChanges: needs_review cleared when the title flag was the only reason", () => {
  const e = { ...gaza(), review_reasons: ["title_differs_from_article: z"], needs_review: true, date_flags: [] };
  applyTitleChanges([e], [detectTitleChange(gaza(), lead())]);
  assert.equal(e.needs_review, false);
});

test("applyTitleChanges: idempotent, skips edited events, held entries and unknown ids", () => {
  const ch = detectTitleChange(gaza(), lead());
  const e = gaza();
  applyTitleChanges([e], [ch]);
  assert.deepEqual(applyTitleChanges([e], [ch]).already, ["2023-israel-hamas-war"]);
  const edited = { ...gaza(), title: "Something else" };
  assert.deepEqual(applyTitleChanges([edited], [ch]).stale, ["2023-israel-hamas-war"]);
  assert.equal(edited.title, "Something else");
  const held = { ...ch, hold: "qid_mismatch" };
  const e2 = gaza();
  assert.deepEqual(applyTitleChanges([e2], [held]).applied, []);
  assert.equal(e2.title, "2023 Israel–Hamas war");
  assert.deepEqual(applyTitleChanges([], [ch]).unknown, ["2023-israel-hamas-war"]);
});

test("titleReport: lists every change and the merge command", () => {
  const ch = { file: "curated", ...detectTitleChange(gaza(), lead()) };
  const held = { file: "curated", ...detectTitleChange({ ...gaza(), id: "b" }, null) };
  const md = titleReport([ch, held], { date: "2026-10-03", checked: 2 });
  assert.match(md, /\*\*1\*\* titles are out of date/);
  assert.match(md, /`2023-israel-hamas-war` \| 2023 Israel–Hamas war \| Gaza war \| no/);
  assert.match(md, /Held - not proposed: 1/);
  assert.match(md, /merge-proposed\.js --titles --apply/);
});
