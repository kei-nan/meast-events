import test from "node:test";
import assert from "node:assert/strict";
import { escapeHtml, metaDescription, renderEventPage, renderSitemap, safeUrl } from "./event-page.mjs";

test("escapeHtml escapes every HTML-significant character", () => {
  assert.equal(escapeHtml(`<a href="x" title='y'>&</a>`), "&lt;a href=&quot;x&quot; title=&#39;y&#39;&gt;&amp;&lt;/a&gt;");
  assert.equal(escapeHtml(null), "");
});

test("safeUrl only lets http(s) through", () => {
  assert.equal(safeUrl("https://en.wikipedia.org/wiki/X"), "https://en.wikipedia.org/wiki/X");
  assert.equal(safeUrl("javascript:alert(1)"), null);
  assert.equal(safeUrl(undefined), null);
});

test("metaDescription keeps a short first paragraph whole and cuts a long one at a word", () => {
  assert.equal(metaDescription("Short lead.\n\nSecond paragraph."), "Short lead.");
  const long = "The war was fought between many parties, over many years, and in many places; ".repeat(5);
  const d = metaDescription(long, 60);
  assert.ok(Array.from(d).length <= 60, d);
  assert.ok(d.endsWith("…"));
  assert.ok(long.startsWith(d.slice(0, -1)), "kept words are the original words");
  assert.ok(!/[\s,;]…$/.test(d), d);
  assert.equal(metaDescription(""), "");
  assert.equal(metaDescription(undefined), "");
});

test("metaDescription never splits a surrogate pair", () => {
  const d = metaDescription("😀".repeat(200), 50);
  assert.equal(Array.from(d).length, 50);
  assert.ok(!/[\uD800-\uDBFF]…$/.test(d));
});

const review = {
  fairness: { found: true, note: "Note <b>about</b> balance.", highlights: ["fought"] },
  wording: {
    found: true,
    findings: [{ guideline: "LABEL", guideline_name: "Contentious labels", shortcut: "MOS:LABEL", url: "https://en.wikipedia.org/wiki/WP:LABEL", phrase: "terror", note: "A label used in Wikipedia's voice." }],
    highlights: ["terror"],
  },
  highlights: [{ text: "fought", kind: "fairness" }, { text: "terror", kind: "wording" }],
  category_note: null,
  data_note: null,
  disclosure: null,
  stale: false,
};

test("an event page escapes data, keeps the title exactly and links to itself, the map and Wikipedia", () => {
  const html = renderEventPage({
    id: "a-b",
    title: `War & "Peace" <1>`,
    date_start: "1967-06-05",
    date_end: "1967-06-10",
    date_precision: "day",
    countries: ["Egypt", "Israel"],
    category: "war",
    wikipedia_url: "https://en.wikipedia.org/wiki/Six-Day_War",
    extract: "It was fought <quickly>.\n\nA terror campaign followed.",
    extract_retrieved_at: "2026-09-26",
    location_quality: "precise",
    framing_review: review,
  });
  assert.match(html, /<title>War &amp; &quot;Peace&quot; &lt;1&gt;<\/title>/);
  assert.match(html, /<link rel="canonical" href="https:\/\/middleeast\.events\/event\/a-b">/);
  assert.match(html, /<a class="open-map" href="\/\?e=a-b">Open on the map<\/a>/);
  assert.match(html, /5 June 1967 \(ended 1967\) · Egypt, Israel/);
  assert.match(html, /It was <mark class="framing-mark framing-mark--fairness"[^>]*>fought<\/mark> &lt;quickly&gt;\./);
  assert.match(html, /Note &lt;b&gt;about&lt;\/b&gt; balance\./);
  assert.match(html, /Our framing review found something in this summary/);
  assert.match(html, /action=history/);
  assert.match(html, /<meta name="description" content="It was fought &lt;quickly&gt;\.">/);
  assert.ok(!/<script/i.test(html), "no scripts (CSP)");
  assert.ok(!html.includes("<quickly>"));
});

test("an event with no dates, countries, extract, link or review still renders", () => {
  const html = renderEventPage({ id: "bare", title: "Bare", location_quality: "none" });
  assert.match(html, /<h1>Bare<\/h1>/);
  assert.match(html, /No summary available\./);
  assert.match(html, /No map location/);
  assert.ok(!html.includes('class="meta"'));
  assert.ok(!html.includes('name="description"'));
  assert.ok(!html.includes("framing-review"));
});

test("Part of links a curated parent and shows any other in Wikidata's label, escaped", () => {
  const html = renderEventPage({
    id: "zikim",
    title: "Zikim attack",
    part_of: [
      { qid: "Q1", label: "Gaza War", id: "gaza-war" },
      { qid: "Q2", label: `Raids <"&'>` },
      { qid: "bad", label: "No item" },
    ],
  });
  assert.match(
    html,
    /<p class="partof">Part of: <a href="\/event\/gaza-war">Gaza War<\/a>, Raids &lt;&quot;&amp;&#39;&gt; <a class="wd" href="https:\/\/www\.wikidata\.org\/wiki\/Q2" rel="noreferrer" aria-label="Wikidata item for Raids &lt;&quot;&amp;&#39;&gt;">Wikidata<\/a>, No item<\/p>/
  );
  assert.match(html, /“Part of” is Wikidata’s statement/);
  assert.ok(!html.includes('class="includes"'));
});

test("Includes lists the children as links to their pages, with an escaped title and year", () => {
  const html = renderEventPage({
    id: "gaza-war",
    title: "Gaza war",
    includes: [
      { id: "a", title: "Battle <A>", date_start: "2023-10-07" },
      { id: "b", title: "Raid B", date_start: null },
      { id: "../evil", title: "Skipped" },
    ],
  });
  assert.match(html, /<h2 id="includes-title">Includes 2 events in this dataset<\/h2>/);
  assert.match(html, /<li><a href="\/event\/a">Battle &lt;A&gt;<\/a> <span class="year">2023<\/span><\/li>/);
  assert.match(html, /<li><a href="\/event\/b">Raid B<\/a><\/li>/);
  assert.ok(!html.includes("Skipped"));
  assert.ok(!html.includes('class="partof"'));
  const one = renderEventPage({ id: "p", title: "P", includes: [{ id: "c", title: "C" }] });
  assert.match(one, /Includes 1 event in this dataset/);
});

test("an invalid id is refused", () => {
  assert.throws(() => renderEventPage({ id: "../x", title: "X" }));
});

test("the sitemap lists home, the index and every event", () => {
  const xml = renderSitemap([{ id: "a" }, { id: "b" }]);
  assert.equal((xml.match(/<loc>/g) ?? []).length, 4);
  assert.match(xml, /<loc>https:\/\/middleeast\.events\/event\/b<\/loc>/);
});
