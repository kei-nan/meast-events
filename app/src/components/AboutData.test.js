import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { elements, moduleUrl, registerRenderHooks, settle, view } from "../lib/testing/render.mjs";

// The About dialog rendered with react-dom/server (lib/testing/render.mjs),
// with its two loaders (lib/dataClient) answered by each test: first paint,
// then the effects run, the loads settle, and it renders again.
registerRenderHooks({
  "../lib/dataClient": moduleUrl(
    "export const loadSelectionFunnel = () => globalThis.__loaders.funnel();" +
      "export const loadFramingReviewSummary = () => globalThis.__loaders.framing();"
  ),
});
const { default: AboutData } = await import("./AboutData.jsx");
const { handPickedCountriesClause, handPickedStartDatesSentence } = await import("../lib/funnelText.js");

const FUNNEL = JSON.parse(readFileSync(new URL("../../../data/selection-funnel.json", import.meta.url), "utf8"));
// The shape split-data.mjs publishes as framing-review.json (its guidelines are data/framing-review.json's).
const FRAMING = {
  reviewed_on: "2026-09-30",
  updated_on: "2026-11-04",
  total: 815,
  guidelines: {
    LABEL: { name: "Contentious labels", reviewed_revision: {}, changed_revision: { timestamp: "2026-10-26T09:37:47Z" } },
    EDITORIAL: { name: "Editorializing", reviewed_revision: {} },
  },
  counts: { fairness: 12, with_wording: 40, guideline: { LABEL: 3, EDITORIAL: 9 }, stale: 2 },
};

const never = () => new Promise(() => {});
const fail = () => Promise.reject(new Error("offline"));

async function open({ funnel = never, framing = never, section = null } = {}) {
  globalThis.__loaders = { funnel, framing };
  const v = view(AboutData, { section, onClose() {} });
  await settle();
  v.rerender();
  return v;
}

// The sentence on the hand-picked events, from "can differ" to the next sentence.
const handPickedSentence = (text) => text.match(/can differ from Wikidata's: (.*?)Each hand-picked event says so\./)?.[1];

test("AboutData: while loading, each count section says so in a status, and the hand-picked sentence reads on without counts", async () => {
  const v = await open();
  const statuses = elements(v.html, "p").filter((p) => p.attrs.role === "status").map((p) => p.text);
  assert.deepEqual(statuses, ["Loading the review counts…", "Loading the coverage counts…", "Loading the selection funnel…"]);
  assert.equal(handPickedSentence(v.text), "");
  // a modal dialog named by its heading, with a Close button saying what it closes
  const dialog = elements(v.html, "dialog")[0];
  assert.equal(dialog.attrs["aria-labelledby"], "about-title");
  assert.match(v.html, /<h2 id="about-title">About the data<\/h2>/);
  assert.equal(elements(v.html, "button")[0].attrs["aria-label"], "Close About the data");
});

test("AboutData: the hand-picked sentence states the committed funnel's counts, from the file (not typed in About)", async () => {
  const v = await open({ funnel: async () => FUNNEL });
  const clause = handPickedCountriesClause(FUNNEL.shown_now) + handPickedStartDatesSentence(FUNNEL.shown_now);
  assert.notEqual(clause, "", "the committed funnel has the counts the sentence uses");
  assert.equal(handPickedSentence(v.text), clause);

  // other counts in the file, other numbers in the sentence: About types none of its own
  const other = structuredClone(FUNNEL);
  Object.assign(other.shown_now, {
    seed_events_also_found_by_discovery: 3,
    seed_events_found_with_other_countries_than_wikidata: 1,
    seed_start_dates_none_of_wikidata_values: 1,
    seed_start_dates_none_of_wikidata_values_checked_against_article: 0,
  });
  const w = await open({ funnel: async () => other });
  assert.equal(
    handPickedSentence(w.text),
    "of the 3 the rule also finds, 1 has other countries than Wikidata gives, and 1 hand-picked start date is none of the item's Wikidata dates (0 of them checked against the article). "
  );
});

test("AboutData: the committed funnel fills Coverage (a row per country) and the Selection funnel", async () => {
  const v = await open({ funnel: async () => FUNNEL });
  const c = FUNNEL.coverage;
  assert.match(v.text, new RegExp(`Counts of the ${c.shown_total.toLocaleString("en-US")} events shown\\.`));
  const region = elements(v.html, "div").find((d) => d.attrs["aria-label"] === "Events by country");
  assert.equal(region.attrs.role, "region");
  assert.equal(region.attrs.tabindex, "0", "the wide table can be scrolled from the keyboard");
  const rows = elements(region.html, "tr").slice(1);
  assert.equal(rows.length, Object.keys(c.by_country).length);
  assert.ok(rows.some((r) => r.text.startsWith("Region-wide")), "the regional tag is shown under its label");
  assert.doesNotMatch(v.text, /Loading the (coverage|selection)|(Coverage|Funnel) unavailable/);
  assert.match(v.text, /Has an English Wikipedia article3,247/, "the funnel's stages, as the file gives them");
});

test("AboutData: a failed funnel load says Coverage and the funnel are unavailable; the sentence still reads on", async () => {
  const v = await open({ funnel: fail, framing: fail });
  const statuses = elements(v.html, "p").filter((p) => p.attrs.role === "status").map((p) => p.text);
  assert.deepEqual(statuses, [
    "Counts unavailable: the published review summary could not be loaded.",
    "Coverage unavailable: the published selection-funnel file could not be loaded or has no coverage counts.",
    "Funnel unavailable: the published selection-funnel file could not be loaded.",
  ]);
  assert.equal(handPickedSentence(v.text), "");
});

test("AboutData: the review counts, guidelines by count, review dates and edited guideline sections", async () => {
  const v = await open({ framing: async () => FRAMING });
  assert.match(v.text, /found an issue in 12 of 815 summaries\. Wording check \(against Wikipedia's own guidelines\) found at least one wording point in 40\./);
  const bars = elements(v.html, "li")
    .filter((li) => /about-bar-label/.test(li.html))
    .map((li) => elements(li.html, "span").filter((s) => /^about-bar-(label|count)$/.test(s.attrs.class)).map((s) => s.text));
  assert.deepEqual(bars, [
    ["Editorializing", "9"],
    ["Contentious labels", "3"],
  ]);
  assert.match(
    v.text,
    /All summaries were reviewed on 30 September 2026; summaries that changed on Wikipedia since then were re-reviewed, most recently on 4 November 2026\./
  );
  assert.match(v.text, /2 summaries have changed on Wikipedia since they were reviewed\./);
  assert.match(v.text, /Wikipedia has since edited one of these sections: Contentious labels \(26 October 2026\)\./);
});

test("AboutData: the credits are a focusable heading, and every credited source is linked, opening in a new tab", async () => {
  const v = await open();
  assert.match(v.html, /<h3 id="about-credits" tabindex="-1">Sources &amp; licences<\/h3>/);
  const credits = v.html.slice(v.html.indexOf('id="about-credits"'));
  const links = elements(credits, "a").map((a) => [a.text, a.attrs.href]);
  const linked = (text, href) => assert.ok(links.some(([t, h]) => t === text && h === href), `credits link ${text} to ${href}`);
  linked("Wikipedia (CC BY-SA 4.0)", "https://creativecommons.org/licenses/by-sa/4.0/");
  linked("CShapes 2.0", "https://icr.ethz.ch/data/cshapes/");
  linked("CC BY-NC-SA 4.0", "https://creativecommons.org/licenses/by-nc-sa/4.0/");
  linked("UN OCHA (HDX)", "https://data.humdata.org/dataset/state-of-palestine-other-0-0-0-0-0");
  linked("GeoNames", "https://www.geonames.org/");
  linked("AGPL-3.0", "https://github.com/kei-nan/meast-events/blob/main/LICENSE");
  linked("third-party licences", "/third-party-licenses.txt");
  for (const a of elements(v.html, "a")) {
    assert.equal(a.attrs.target, "_blank", `${a.text} opens in a new tab`);
    assert.equal(a.attrs.rel, "noreferrer");
    assert.equal(a.attrs.title, "Opens in a new tab", `${a.text} says it opens in a new tab`);
  }
  assert.match(v.text, /\(source: Palestinian Authority, Ministry of Planning \(PA MOP\)\), non-commercial use, credited to UN OCHA and PA MOP\./);
});
