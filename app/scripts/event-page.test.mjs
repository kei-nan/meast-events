import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import {
  CSHAPES_URL,
  NO_JS_STYLESHEET,
  OCHA_AREAS_URL,
  SHELL_MARKERS,
  escapeHtml,
  fillAppShell,
  metaDescription,
  renderEventPage,
  renderIndexPage,
  renderNotFoundPage,
  renderSitemap,
  eventJsonLd,
  eventPageTitle,
  eventShareTitle,
  jsonLdScript,
  safeUrl,
  titleHasYear,
} from "./event-page.mjs";

// The app's own index.html (its source; the build fills in the built one, which
// differs only in the script and style tags Vite writes).
const TEMPLATE = fs.readFileSync(new URL("../index.html", import.meta.url), "utf8");
const page = (event) => renderEventPage(event, TEMPLATE);

// Border source families that NOTICE requires us to credit: how to spot one in a
// feature's `source` in data/boundaries.json, and what the credit must contain.
// (Natural Earth, also named in some sources, is public domain: no credit required.)
const BORDER_CREDITS = [
  { name: "CShapes", used: /CShapes 2\.0/, credit: ["CShapes 2.0", CSHAPES_URL] },
  { name: "UN OCHA", used: /UN OCHA|OCHA's|data\.humdata\.org/, credit: ["UN OCHA", OCHA_AREAS_URL] },
];

test("every border source family in boundaries.json is credited on event pages and in the About dialog", () => {
  const boundaries = JSON.parse(fs.readFileSync(new URL("../../data/boundaries.json", import.meta.url), "utf8"));
  const sources = boundaries.features.map((f) => String(f.properties?.source ?? ""));
  const used = BORDER_CREDITS.filter((family) => sources.some((s) => family.used.test(s)));
  // Both are in the data today; if one disappears, update the list rather than pass vacuously.
  assert.deepEqual(used.map((f) => f.name), ["CShapes", "UN OCHA"]);
  // The OCHA link credited is the dataset the features name.
  assert.ok(sources.some((s) => s.includes(OCHA_AREAS_URL)), "OCHA dataset URL matches boundaries.json");

  const pages = {
    "event page": page({ id: "x", title: "X" }),
    "event index": renderIndexPage([{ id: "x", title: "X" }]),
    "AboutData.jsx": fs.readFileSync(new URL("../src/components/AboutData.jsx", import.meta.url), "utf8"),
  };
  for (const family of used) {
    for (const [where, text] of Object.entries(pages)) {
      for (const needle of family.credit) {
        assert.ok(text.includes(needle), `${where} credits ${family.name}: missing ${JSON.stringify(needle)}`);
      }
    }
  }
});

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

test("an event page escapes data, keeps the title exactly and links to itself and Wikipedia", () => {
  const html = page({
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
  assert.match(html, /<title>War &amp; &quot;Peace&quot; &lt;1&gt; \(1967\) – Middle East, 1900–present<\/title>/);
  assert.match(html, /<h1>War &amp; &quot;Peace&quot; &lt;1&gt;<\/h1>/);
  // Link previews carry the years too, without the site name (og:site_name has it).
  assert.match(html, /<meta property="og:title" content="War &amp; &quot;Peace&quot; &lt;1&gt; \(1967\)">/);
  assert.match(html, /<meta name="twitter:title" content="War &amp; &quot;Peace&quot; &lt;1&gt; \(1967\)">/);
  assert.match(html, /<link rel="canonical" href="https:\/\/middleeast\.events\/event\/a-b">/);
  assert.match(html, /<a class="wiki" href="https:\/\/en\.wikipedia\.org\/wiki\/Six-Day_War" rel="noreferrer">Read on Wikipedia<\/a>/);
  assert.doesNotMatch(html, /open-map|\?e=/); // the page is the map
  assert.match(html, /5 June 1967 \(ended 1967\) · Egypt, Israel/);
  assert.match(html, /It was <mark class="framing-mark framing-mark--fairness"[^>]*>fought<\/mark> &lt;quickly&gt;\./);
  assert.match(html, /Note &lt;b&gt;about&lt;\/b&gt; balance\./);
  assert.match(html, /Our framing review found something in this summary/);
  assert.match(html, /action=history/);
  assert.match(html, /<meta name="description" content="Wikipedia: It was fought &lt;quickly&gt;\.">/);
  assert.match(html, /<meta property="og:description" content="Wikipedia: It was fought &lt;quickly&gt;\.">/);
  // index.html's "js" class script (its hash is in the CSP), the JSON-LD data block,
  // which is never run (CSP script-src does not apply), and the app's script.
  assert.deepEqual(html.match(/<script[^>]*>/gi), ["<script>", '<script type="application/ld+json">', '<script type="module" src="/src/main.jsx">']);
  assert.ok(!html.includes("<quickly>"));
});

test("Cite this: the Wikipedia article in APA, MLA and Chicago, the revision's permalink when known", () => {
  const base = {
    id: "six-day-war",
    title: "Six-Day War",
    wikipedia_url: "https://en.wikipedia.org/wiki/Six-Day_War",
    extract: "It was fought.",
    extract_retrieved_at: "2026-09-26",
  };
  const html = page({ ...base, wikipedia_revid: 123, wikipedia_revid_timestamp: "2026-10-15T19:38:37Z" });
  assert.match(html, /<h2 id="cite-title">Cite this<\/h2>/);
  assert.match(
    html,
    /<p class="cite-text">Six-Day War\. \(2026, October 15\)\. In <i>Wikipedia<\/i>\. https:\/\/en\.wikipedia\.org\/w\/index\.php\?title=Six-Day_War&amp;oldid=123<\/p>/
  );
  assert.match(html, /“Six-Day War\.” <i>Wikipedia: The Free Encyclopedia<\/i>, Wikimedia Foundation, 15 Oct\. 2026, en\.wikipedia\.org\/w\/index\.php\?title=Six-Day_War&amp;oldid=123\.<\/p>/);
  assert.match(html, /Wikipedia, “Six-Day War,” last modified October 15, 2026, 19:38 \(UTC\), https:\/\/en\.wikipedia\.org\/w\/index\.php\?title=Six-Day_War&amp;oldid=123\./);
  assert.match(html, /The link is the Wikipedia revision of October 15, 2026 \(revision 123\), whose lead is exactly the text shown here\./);
  assert.doesNotMatch(html, /Retrieved September|Accessed 26|accessed September/);
  assert.match(html, /This event on Middle East, 1900–present: https:\/\/middleeast\.events\/event\/six-day-war/);
  assert.match(html, /CShapes 2\.0 - historical country borders\. Schvitz, G\., et al\. \(2022\)/);
  // "If you use the map's borders" names every border source NOTICE credits, OCHA with its own (non-CC) terms.
  assert.match(html, /UN OCHA \/ HDX &quot;Oslo Agreement&quot; Areas A\/B\/C \(West Bank\)\. Distributed under the legacy HumanitarianResponse\.info terms: non-commercial use with credit to UN OCHA\./);
  assert.match(html, /GeoNames - CC BY 4\.0/);
  assert.doesNotMatch(html, /cite-live/);

  const live = page(base);
  assert.match(live, /<p class="note cite-live">No revision is recorded for this text, so the link is the live article: Wikipedia’s text may have changed since it was retrieved on September 26, 2026\.<\/p>/);
  assert.match(live, /Retrieved September 26, 2026, from https:\/\/en\.wikipedia\.org\/wiki\/Six-Day_War<\/p>/);
  // no article: no section
  assert.doesNotMatch(page({ id: "bare", title: "Bare" }), /cite-title/);
});

test("an event with no dates, countries, extract, link or review still renders", () => {
  const html = page({ id: "bare", title: "Bare", location_quality: "none" });
  assert.match(html, /<h1>Bare<\/h1>/);
  assert.match(html, /No summary available\./);
  assert.match(html, /No map location/);
  assert.ok(!html.includes('class="meta"'));
  assert.ok(!html.includes('name="description"'));
  assert.ok(!html.includes("framing-review"));
});

test("Part of links a curated parent and shows any other in Wikidata's label, escaped", () => {
  const html = page({
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
  const html = page({
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
  const one = page({ id: "p", title: "P", includes: [{ id: "c", title: "C" }] });
  assert.match(one, /Includes 1 event in this dataset/);
});

test("Related lists each group as links, with the full date for same-time events and the distance for nearby ones", () => {
  const html = page({
    id: "e",
    title: "E",
    related: {
      shared_parent: [{ id: "s", title: "Sibling <S>", date_start: "1917-10-31" }],
      nearby: [
        { id: "n", title: "Near", date_start: "2023-10-07", km: 12.4, bearing: 50 },
        { id: "z", title: "Same spot", date_start: null, km: 0 },
      ],
      same_time: [{ id: "t", title: "Then", date_start: "1917-11-02" }, { id: "../evil", title: "Skipped" }],
    },
  });
  assert.match(html, /<h2 id="related-title">Related events in this dataset<\/h2>/);
  assert.match(html, /<h3>Also part of the same wider events<\/h3>\n<ul>\n<li><a href="\/event\/s">Sibling &lt;S&gt;<\/a> <span class="year">1917<\/span><\/li>/);
  assert.match(html, /<a href="\/event\/n">Near<\/a> <span class="year">2023 · 12 km NE<\/span>/);
  assert.match(html, /<a href="\/event\/z">Same spot<\/a> <span class="year">under 1 km<\/span>/);
  assert.match(html, /<a href="\/event\/t">Then<\/a> <span class="year">2 November 1917<\/span>/);
  assert.ok(!html.includes("Skipped"));
  assert.ok(!page({ id: "p", title: "P", related: { nearby: [] } }).includes('id="related-title"'));
});

test("only an end before the start gets a date note, in plain language", () => {
  const html = page({
    id: "passover-massacre",
    title: "Passover massacre",
    date_start: "2002-03-27",
    date_end: "2002-01-01",
    date_precision: "day",
    date_flags: ["date_order_invalid: x", "wikipedia_dates_note: y"],
    wikipedia_lead_dates: ["2002-03-27"],
  });
  assert.ok(html.includes("Wikidata gives this event’s end (1 January 2002) as before its start (27 March 2002); Wikipedia gives 27 March 2002."));
  assert.doesNotMatch(html, /date_order_invalid|wikipedia_dates_note|Date unverified/);
  const other = page({ id: "w", title: "W", date_start: "1930-01-01", date_flags: ["date_start_year_not_in_lead: z"] });
  assert.doesNotMatch(other, /date_start_year_not_in_lead|Date unverified|role="note"/);
});

test("a documented data fix is noted with a link to its entry; a rounded pin gets its own location note", () => {
  const oct7 = page({ id: "october-7-attacks", title: "October 7 attacks", data_fixes: [{ ref: "F7", anchor: "f7---october-7-attacks" }] });
  assert.ok(
    oct7.includes(
      'Corrected by this project (<a href="https://github.com/kei-nan/meast-events/blob/main/docs/data-fixes.md#f7---october-7-attacks" rel="noreferrer">F7</a> in our log of data fixes).'
    )
  );
  assert.doesNotMatch(page({ id: "x", title: "X" }), /Corrected by this project/);
  const anfal = page({
    id: "al-anfal-campaign",
    title: "Al-Anfal campaign",
    location_quality: "approximate",
    approximate_reason: "rounded",
    coordinate_source: "wikidata",
    coordinates: { lat: 33, lon: 43 },
  });
  assert.ok(anfal.includes("Approximate location: Wikidata gives this event’s coordinates only to the nearest degree or tenth of a degree (33, 43)"));
  assert.doesNotMatch(anfal, /reference point/);
  const capital = page({ id: "c", title: "C", location_quality: "approximate", coordinate_source: "country-fallback:Iraq", coordinates: { lat: 33.3152, lon: 44.3661 } });
  assert.match(capital, /reference point used for every such event of Iraq \(Baghdad\), whatever its date/);
  assert.doesNotMatch(capital, /capital/);
});

test("classes: only those on the event-class list, with a link to the Wikidata item; the seed note", () => {
  const html = page({ id: "f", title: "F", category: "atrocity", wikidata_qid: "Q1", wikidata_classes: ["famine", "fake news", "genocide"], hand_picked: true });
  assert.match(html, /Wikidata classes on our event-class list: genocide \(all its classes: <a class="wd" href="https:\/\/www\.wikidata\.org\/wiki\/Q1"/);
  assert.doesNotMatch(html, /fake news/);
  assert.match(html, /Hand-picked event: it is on this project’s own list of events/);
  assert.doesNotMatch(page({ id: "g", title: "G" }), /Hand-picked/);
});

test("category: the group, with the Wikidata class it comes from behind a native disclosure, as on the event panel", () => {
  const html = page({ id: "h", title: "H", category: "atrocity", wikidata_classes: ["famine", "genocide"] });
  assert.match(
    html,
    /<details class="category"><summary>Category: Atrocity<span class="info" aria-hidden="true">ⓘ<\/span><span class="sr">, where this category comes from<\/span><\/summary><p class="category-source">From Wikidata’s class “<a class="wd" href="https:\/\/www\.wikidata\.org\/wiki\/Q41397" rel="noreferrer" aria-label="genocide \(Wikidata class\)">genocide<\/a>”<\/p><\/details>/
  );
  assert.doesNotMatch(html, /<details class="category" open/, "collapsed by default");
  assert.doesNotMatch(html, /our grouping/);
  assert.match(page({ id: "w", title: "W", category: "war" }), /<p class="category">Category: War<\/p>/, "classes not loaded: no disclosure");
});

test("category: a mixed event names its groups, and its classes grouped by group when opened", () => {
  const html = page({
    id: "i",
    title: "I",
    category: "mixed",
    wikidata_classes: ["invasion", "military operation", "armed conflict", "political crisis", "international crisis"],
  });
  assert.match(html, /<summary>Category: Mixed: War, Political<span/);
  const text = html.match(/<p class="category-source">(.*?)<\/p>/)[1].replace(/<[^>]+>/g, "");
  assert.equal(text, "From Wikidata’s classes: military operation, armed conflict (War); political crisis, international crisis (Political)");
});

test("category: the class behind terrorism is linked the same way whoever the victims were", () => {
  const bahr = page({ id: "b", title: "B", category: "terrorism", wikidata_classes: ["bomb attack", "terrorist attack"] });
  const oct7 = page({ id: "o", title: "O", category: "terrorism", wikidata_classes: ["coordinated terrorist attack", "massacre", "terrorist attack"] });
  const line = /<details class="category"><summary>Category: Terrorism<span class="info" aria-hidden="true">ⓘ<\/span><span class="sr">, where this category comes from<\/span><\/summary><p class="category-source">From Wikidata’s class “<a class="wd" href="https:\/\/www\.wikidata\.org\/wiki\/Q2223653" rel="noreferrer" aria-label="terrorist attack \(Wikidata class\)">terrorist attack<\/a>”<\/p><\/details>/;
  assert.match(bahr, line);
  assert.match(oct7, line);
});

test("an invalid id is refused", () => {
  assert.throws(() => page({ id: "../x", title: "X" }));
});

test("the sitemap lists home, the index and every event", () => {
  const xml = renderSitemap([{ id: "a" }, { id: "b" }]);
  assert.equal((xml.match(/<loc>/g) ?? []).length, 4);
  assert.match(xml, /<loc>https:\/\/middleeast\.events\/event\/b<\/loc><\/url>/);
  assert.doesNotMatch(xml, /lastmod/);
});

test("the sitemap dates each event by its text's retrieval, and home and the index by the latest", () => {
  const xml = renderSitemap([
    { id: "a", extract_retrieved_at: "2026-09-26T04:00:00Z" },
    { id: "b", extract_retrieved_at: "2026-10-02" },
    { id: "c", extract_retrieved_at: "not a date" },
  ]);
  assert.match(xml, /<loc>https:\/\/middleeast\.events\/<\/loc><lastmod>2026-10-02<\/lastmod>/);
  assert.match(xml, /<loc>https:\/\/middleeast\.events\/event\/<\/loc><lastmod>2026-10-02<\/lastmod>/);
  assert.match(xml, /event\/a<\/loc><lastmod>2026-09-26<\/lastmod>/);
  assert.match(xml, /event\/c<\/loc><\/url>/);
});

test("the 404 page is not indexed, names no canonical address and links home with absolute paths", () => {
  const html = renderNotFoundPage();
  assert.match(html, /<meta name="robots" content="noindex">/);
  assert.doesNotMatch(html, /rel="canonical"|og:url/);
  assert.match(html, /<link rel="stylesheet" href="\/event\/event\.css">/);
  assert.match(html, /href="\/event\/"/);
  assert.doesNotMatch(html, /href="(?!\/|https:)/);
});

test("pages with an address still name it as canonical and og:url", () => {
  const html = renderIndexPage([{ id: "x", title: "X" }]);
  assert.match(html, /<link rel="canonical" href="https:\/\/middleeast\.events\/event\/">/);
  assert.match(html, /<meta property="og:url" content="https:\/\/middleeast\.events\/event\/">/);
  assert.doesNotMatch(html, /noindex/);
});

const ldOf = (html) => JSON.parse(html.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/)[1]);

test("names in Arabic, Hebrew or Persian script are isolated with <bdi>, the text unchanged and escaped", () => {
  const extract = "The revolt (Arabic: ثورة البراق, Thawrat al-Burāq; Hebrew: מאורעות תרפ\"ט) <began>.";
  const html = page({ id: "r", title: "R", extract });
  assert.match(html, /\(Arabic: <bdi dir="rtl" lang="ar">ثورة البراق<\/bdi>, Thawrat/);
  assert.match(html, /Hebrew: <bdi dir="rtl" lang="he">מאורעות תרפ&quot;ט<\/bdi>\) &lt;began&gt;\./);
  const text = html.match(/<div class="extract"><p>([\s\S]*?)<\/p>/)[1].replace(/<\/?bdi[^>]*>/g, "");
  assert.equal(text, escapeHtml(extract));
  // An unlabelled run gets dir but no lang; Persian is labelled "fa".
  assert.match(page({ id: "u", title: "U", extract: "Said ثورة here." }), /<bdi dir="rtl">ثورة<\/bdi>/);
  assert.match(page({ id: "f", title: "F", extract: "(Persian: کودتا)" }), /<bdi dir="rtl" lang="fa">کودتا<\/bdi>/);
});

test("a highlight that covers a right-to-left name keeps both the mark and the <bdi>", () => {
  const html = page({
    id: "m",
    title: "M",
    extract: "Known as ثورة البراق today.",
    framing_review: { ...review, highlights: [{ text: "as ثورة", kind: "wording" }] },
  });
  assert.match(html, /<mark class="framing-mark framing-mark--wording"[^>]*>as <bdi dir="rtl">ثورة<\/bdi><\/mark><bdi dir="rtl"> البراق<\/bdi> today\./);
});

test("the tab title has the years as the app shows them and the site name", () => {
  assert.equal(eventPageTitle({ id: "b", title: "Balkan Wars", date_start: "1912-10-08", date_end: "1913-08-10" }), "Balkan Wars (1912–1913) – Middle East, 1900–present");
  assert.equal(eventPageTitle({ id: "s", title: "S", date_start: "1967-06-05", date_end: "1967-06-10" }), "S (1967) – Middle East, 1900–present");
  // A reversed range stays in the order given, like the app.
  assert.equal(eventPageTitle({ id: "r", title: "R", date_start: "2002-03-27", date_end: "2001-01-01" }), "R (2002–2001) – Middle East, 1900–present");
  assert.equal(eventPageTitle({ id: "n", title: "N" }), "N – Middle East, 1900–present");
});

test("share and tab titles: a title that names a year gets no (years) added", () => {
  // The same years: not repeated.
  assert.equal(eventShareTitle({ id: "b", title: "Capture of Baghdad (1917)", date_start: "1917-03-11" }), "Capture of Baghdad (1917)");
  assert.equal(eventShareTitle({ id: "p", title: "1929 Palestine riots", date_start: "1929-08-23", date_end: "1929-08-29" }), "1929 Palestine riots");
  // Different years from the dates: the title's own are not followed by another range.
  assert.equal(
    eventShareTitle({ id: "t", title: "Political violence in Turkey (1976–1980)", date_start: "1968-01-01", date_end: "1980-09-12" }),
    "Political violence in Turkey (1976–1980)"
  );
  assert.equal(
    eventPageTitle({ id: "t", title: "Anglo-Iraqi Treaty of 1930", date_start: "1932-10-03" }),
    "Anglo-Iraqi Treaty of 1930 – Middle East, 1900–present"
  );
  // A longer number is not a year.
  assert.equal(eventShareTitle({ id: "m", title: "Metrojet Flight 9268", date_start: "2015-10-31" }), "Metrojet Flight 9268 (2015)");
  assert.equal(titleHasYear("Flight 19480"), false);
  assert.equal(titleHasYear("2015–2016 Latakia offensive"), true);
});

test("JSON-LD: a WebPage about a Thing (not an Event), dates at the recorded precision, a place only when precise", () => {
  const base = { id: "e", title: "E", wikipedia_url: "https://en.wikipedia.org/wiki/E", wikidata_qid: "Q1", extract: "Text." };
  const day = eventJsonLd({ ...base, date_start: "1967-06-05", date_end: "1967-06-10", date_precision: "day", location_quality: "precise", coordinates: { lat: 31.5, lon: 34.4 } });
  assert.equal(day["@type"], "WebPage");
  assert.equal(day.url, "https://middleeast.events/event/e");
  assert.equal(day.isBasedOn, "https://en.wikipedia.org/wiki/E");
  assert.equal(day.license, "https://creativecommons.org/licenses/by-sa/4.0/");
  assert.equal(day.description, "Text.");
  assert.deepEqual(day.about, {
    "@type": "Thing",
    name: "E",
    sameAs: ["https://en.wikipedia.org/wiki/E", "https://www.wikidata.org/wiki/Q1"],
  });
  // The end is the page's "(ended 1967)": no precision is recorded for an end date.
  assert.equal(day.temporalCoverage, "1967-06-05/1967");
  assert.deepEqual(day.spatialCoverage, { "@type": "Place", geo: { "@type": "GeoCoordinates", latitude: 31.5, longitude: 34.4 } });
  const month = eventJsonLd({ ...base, date_start: "1948-05-01", date_end: "1949-03-10", date_precision: "month", location_quality: "approximate", coordinates: { lat: 1, lon: 2 } });
  assert.equal(month.temporalCoverage, "1948-05/1949");
  assert.equal(month.spatialCoverage, undefined, "a capital-city fallback is not a location");
  assert.equal(eventJsonLd({ ...base, date_start: "1910-01-01", date_precision: "decade" }).temporalCoverage, "1910");
  assert.equal(eventJsonLd({ ...base, date_start: "1930-05-04", date_precision: "day", date_flags: ["x"] }).temporalCoverage, "1930");
  assert.equal(eventJsonLd({ ...base, date_start: "1967-06-05", date_end: "1967-06-10", date_precision: "year" }).temporalCoverage, "1967");
  const reversed = eventJsonLd({ ...base, date_start: "2002-03-27", date_end: "2002-01-01", date_precision: "day" });
  assert.equal(reversed.temporalCoverage, "2002");
  const bare = eventJsonLd({ id: "bare", title: "Bare", location_quality: "none" });
  assert.deepEqual(bare.about, { "@type": "Thing", name: "Bare" });
  assert.equal(bare.temporalCoverage, undefined);
  assert.ok(!JSON.stringify(day).includes('"Event"'), "nothing is typed schema.org Event");
  assert.equal(bare.isBasedOn, undefined);
  assert.equal(eventJsonLd({ ...base, wikipedia_url: "javascript:alert(1)" }).isBasedOn, undefined);
});

test("JSON-LD cannot close its script element, and parses back to the data", () => {
  const event = { id: "x", title: "</script><script>alert(1)</script> & <!-- \u2028", extract: "a </SCRIPT> b" };
  const block = jsonLdScript(eventJsonLd(event));
  const inner = block.slice('<script type="application/ld+json">'.length, -"</script>".length);
  assert.doesNotMatch(inner, /[<>&\u2028\u2029]/);
  assert.deepEqual(JSON.parse(inner), eventJsonLd(event));
  const html = page(event);
  assert.equal((html.match(/<\/script>/gi) ?? []).length, 3); // and the app's own two (the "js" class, the entry)
  assert.equal(ldOf(html).name, event.title);
});

test("an event page is index.html with the event's head tags and the event inside #root", () => {
  const html = page({ id: "a-b", title: "T", extract: "Lead." });
  // index.html's own tags outside the two regions stay; the site-wide ones inside go.
  assert.match(html, /<meta charset="UTF-8" \/>/);
  assert.match(html, /<meta name="theme-color" content="#1d1a15" \/>/);
  assert.match(html, /<script type="module" src="\/src\/main\.jsx"><\/script>/);
  assert.equal((html.match(/<title>/g) ?? []).length, 1);
  assert.equal((html.match(/rel="canonical"/g) ?? []).length, 1);
  assert.equal((html.match(/property="og:url"/g) ?? []).length, 1);
  assert.doesNotMatch(html, /https:\/\/middleeast\.events\/" \/>/); // the home page's canonical/og:url
  // The event itself is the no-JavaScript content: index.html's <noscript> note is gone,
  // and the only <noscript> left is the stylesheet's, in the <head>.
  assert.equal((html.match(/<noscript>/g) ?? []).length, 1);
  assert.doesNotMatch(html.slice(html.indexOf("<body")), /<noscript>/);
  assert.doesNotMatch(html, /<!-- \/?page-(meta|body) -->/);
  // The event, inside #root (React replaces it), styled only without JavaScript.
  assert.match(html, /<div id="root"><div class="static-page">\n<header class="site-header">[\s\S]*<h1>T<\/h1>[\s\S]*<\/footer>\n<\/div><\/div>/);
  assert.ok(html.includes(NO_JS_STYLESHEET));
  assert.equal((html.match(/event\.css/g) ?? []).length, 1);
  // The script that hides it before the first paint comes before any stylesheet.
  assert.ok(html.indexOf(`classList.add("js")`) < html.indexOf("stylesheet"));
  // No preload unless the build names the bucket.
  assert.doesNotMatch(html, /rel="preload"/);
});

test("an event page preloads the bucket it is given, as the app's fetch() asks for it", () => {
  const html = renderEventPage({ id: "a", title: "A" }, TEMPLATE, { preload: "/data/events/v.0123456789ab/full/7.json" });
  assert.equal((html.match(/rel="preload"/g) ?? []).length, 1);
  assert.ok(html.includes(`<link rel="preload" href="/data/events/v.0123456789ab/full/7.json" as="fetch" crossorigin="anonymous">`));
  assert.ok(html.indexOf('rel="preload"') < html.indexOf("</head>"));
});

test("an event page links to the events before and after it, escaped, and to neither when there is none", () => {
  const html = renderEventPage({ id: "b", title: "B" }, TEMPLATE, {
    neighbours: { prev: { id: "a", title: "A <1>", date_start: "1910-01-01" }, next: { id: "c", title: "C" } },
  });
  assert.match(html, /<li>Earlier: <a href="\/event\/a" rel="prev">A &lt;1&gt;<\/a> <span class="year">1910<\/span><\/li>/);
  assert.match(html, /<li>Later: <a href="\/event\/c" rel="next">C<\/a><\/li>/);
  const last = renderEventPage({ id: "c", title: "C" }, TEMPLATE, { neighbours: { prev: { id: "b", title: "B" }, next: undefined } });
  assert.doesNotMatch(last, /rel="next"/);
  assert.doesNotMatch(page({ id: "x", title: "X" }), /class="includes neighbours"/);
});

test("index.html and the plain pages link every icon", () => {
  for (const html of [TEMPLATE, renderNotFoundPage(), renderIndexPage([])]) {
    for (const href of ["/favicon.ico", "/favicon.svg", "/apple-touch-icon.png"]) assert.ok(html.includes(`href="${href}"`), href);
  }
});

test("fillAppShell refuses a template whose markers are missing, repeated or out of order", () => {
  const [mo, mc] = SHELL_MARKERS.meta;
  const [bo, bc] = SHELL_MARKERS.body;
  const meta = { title: "T", description: "", canonical: null, type: "website" };
  const ok = `<head>${mo}x${mc}</head><body>${bo}<div id="root"></div>${bc}</body>`;
  assert.match(fillAppShell(ok, meta, "C"), /<title>T<\/title>[\s\S]*<div id="root"><div class="static-page">\nC\n<\/div><\/div>/);
  assert.throws(() => fillAppShell(ok.replace(mo, ""), meta, "C"), /exactly once/);
  assert.throws(() => fillAppShell(ok.replace(bc, bc + bc), meta, "C"), /exactly once/);
  assert.throws(() => fillAppShell(`${mc}${mo}${bo}${bc}`, meta, "C"), /comes before/);
});
