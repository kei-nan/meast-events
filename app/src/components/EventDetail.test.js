import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { elements, registerRenderHooks, settle, textOf, view } from "../lib/testing/render.mjs";

// The open-event view rendered with react-dom/server (lib/testing/render.mjs),
// for real records of data/events.json as the app has them once opened: the
// lite record split-data.mjs publishes (normalized by lib/dataClient.js) with
// the full record merged over it, framing review included (split-data.mjs framingFor).
registerRenderHooks();
const { default: EventDetail } = await import("./EventDetail.jsx");
const { normalizeEvents } = await import("../lib/dataClient.js");
const { detailFields, framingFor, publicEvent } = await import("../../scripts/split-data.mjs");

const read = (p) => JSON.parse(readFileSync(new URL(`../../../data/${p}`, import.meta.url), "utf8"));
const RAW = new Map(read("events.json").map((e) => [e.id, e]));
const REVIEW = read("framing-review.json");

function opened(id, over = {}) {
  const raw = RAW.get(id);
  assert.ok(raw, `${id} is in data/events.json`);
  const [lite] = normalizeEvents([publicEvent(raw)]);
  const full = {
    extract: raw.extract ?? "",
    extract_retrieved_at: raw.extract_retrieved_at ?? null,
    ...detailFields(raw),
    date_precision: raw.date_precision ?? null,
    framing_review: framingFor(REVIEW, raw),
  };
  return { ...lite, ...full, ...over };
}
// Before the full record is in: the lite record with its snippet (App.jsx).
function loadingLead(id, leadStatus = "loading") {
  const raw = RAW.get(id);
  const [lite] = normalizeEvents([publicEvent(raw)]);
  return { ...lite, extract: lite.snippet ?? "", leadStatus };
}

function render(event, over = {}) {
  return view(EventDetail, { event, onBack() {}, onSelectEvent() {}, ...over });
}
const buttons = (html) => elements(html, "button").map((b) => b.text);
const about = (html) => textOf(html.slice(html.indexOf('id="event-detail-about-title"')));

// Let the lazily loaded framing review arrive once; later renders show it at once.
// Its module is imported first, then the view is rendered until the review is in
// it: one settle() was enough here but not on a slower CI runner, where compiling
// FramingReview.jsx and its imports outlasted it and the review tests failed.
await import("./FramingReview.jsx");
for (let i = 0; !/role="tablist"/.test(render(opened("sykes-picot-agreement")).html); i++) {
  assert.ok(i < 200, "the lazily loaded framing review never arrived");
  await settle();
}

test("EventDetail: an event with a precise location: title, date and countries, Find on map, place history, and its Wikipedia credit", () => {
  const event = opened("siege-of-adrianople-1912-1913");
  assert.equal(event.location_quality, "precise");
  const v = render(event, { onShowOnMap() {}, onPlaceHistory() {} });
  const article = elements(v.html, "article")[0];
  assert.equal(article.attrs["aria-labelledby"], "event-detail-title");
  const [h2] = elements(v.html, "h2");
  assert.equal(h2.attrs.id, "event-detail-title");
  assert.equal(h2.attrs.tabindex, "-1", "the heading takes focus when the event opens");
  assert.equal(h2.text, event.title);
  assert.match(textOf(elements(v.html, "p").find((p) => p.attrs.class === "event-detail-meta").html), /^\d.* · Turkey$/);
  assert.ok(buttons(v.html).includes("Find on map"));
  assert.ok(buttons(v.html).includes("History of this place"));
  const wiki = elements(v.html, "a").find((a) => /event-detail-wiki/.test(a.attrs.class));
  assert.equal(wiki.attrs.href, event.wikipedia_url);
  assert.equal(wiki.text, "Read on Wikipedia ↗ (opens in a new tab)");
  assert.doesNotMatch(about(v.html), /No map location|left out of drawn-area searches/);
  const history = elements(v.html, "a").find((a) => a.text === "Wikipedia contributors");
  assert.equal(history.attrs.href, `${event.wikipedia_url}?action=history`);
});

test("EventDetail: the attribution is the static event page's, naming the change and the article it comes from", async () => {
  const { renderEventPage } = await import("../../scripts/event-page.mjs");
  const template = readFileSync(new URL("../../index.html", import.meta.url), "utf8");
  const attribution = (html) => {
    const p = elements(html, "p").find((x) => /\battribution\b/.test(x.attrs.class ?? ""));
    assert.ok(p, "an attribution line");
    return { text: textOf(p.html), links: elements(p.html, "a").map((a) => [a.text, a.attrs.href]) };
  };
  for (const id of ["siege-of-adrianople-1912-1913", "ein-hashlosha-massacre"]) {
    const event = opened(id);
    const panel = attribution(render(event).html);
    assert.deepEqual(panel, attribution(renderEventPage(event, template)), `${id}: the panel and the page say the same`);
    assert.match(panel.text, /^Text from Wikipedia \(the article’s lead section as plain text, references removed\), licensed CC BY-SA 4\.0 by Wikipedia contributors, from the article /);
    assert.ok(panel.text.includes(`from the article ${event.text_from_article ?? event.title}.`), `${id}: names its article`);
  }
  assert.equal(opened("ein-hashlosha-massacre").text_from_article, "October 7 attacks");
});

test("EventDetail: an event without a location says it has no marker, offers no Find on map or place history", () => {
  const event = opened("battle-of-riyadh");
  assert.equal(event.location_quality, "none");
  const v = render(event, { onShowOnMap() {}, onPlaceHistory() {} });
  assert.ok(!buttons(v.html).includes("Find on map"));
  assert.ok(!buttons(v.html).includes("History of this place"));
  assert.match(
    about(v.html),
    /No map location: Wikipedia and Wikidata give no coordinates for this event, so it has no marker on the map and is left out of drawn-area searches\./
  );
});

test("EventDetail: without a map, Find on map stays, disabled, saying why", () => {
  const v = render(opened("siege-of-adrianople-1912-1913"), { onShowOnMap() {}, mapUnavailable: true });
  const find = elements(v.html, "button").find((b) => b.text.startsWith("Find on map"));
  assert.ok(find, "still offered");
  assert.ok(find.attrs["aria-disabled"] === "true" || "disabled" in find.attrs, "but not usable");
  assert.match(find.text, /^Find on map \(.+\)$/, "with the reason for screen readers");
});

test("EventDetail: a hand-picked event with an approximate location says so, and its framing review marks the flagged words", () => {
  const event = opened("sykes-picot-agreement");
  assert.equal(event.hand_picked, true);
  assert.equal(event.location_quality, "approximate");
  const review = event.framing_review;
  assert.ok(review?.highlights.length, "the committed review flags words in this summary");
  const v = render(event);
  assert.match(about(v.html), /Approximate location: .* It is left out of drawn-area searches\./);
  // (no border shapes are loaded here, so the shading note says nothing is shaded)
  assert.match(about(v.html), /The shaded area on the map is the event's listed countries|so nothing is shaded/);
  assert.match(about(v.html), /Hand-picked event: it is on this project’s own list of events/);

  const marks = elements(v.html, "mark");
  assert.ok(marks.length > 0);
  for (const m of marks) {
    assert.equal(m.attrs.role, "button");
    assert.equal(m.attrs.tabindex, "0");
    // Named by its words (an aria-label would replace them, and the lang of a
    // name in another script with them), described by the review that flagged it.
    assert.equal(m.attrs["aria-label"], undefined);
    assert.match(m.attrs["aria-describedby"], /^(framing-mark-(fairness|wording|any) )+framing-mark-why$/);
    for (const id of m.attrs["aria-describedby"].split(" ")) assert.match(v.html, new RegExp(`id="${id}"`));
    assert.ok(event.extract.includes(m.text), "the marked words are the article's own, unchanged");
  }
  const fairness = review.highlights.find((h) => h.kind === "fairness")?.text;
  if (fairness) assert.ok(marks.some((m) => m.text === fairness && /framing-mark-fairness/.test(m.attrs["aria-describedby"])));
  assert.match(v.html, /id="framing-mark-why">Select to read why\./);
  // the review itself (lazy FramingReview) is in the view, with its two tabs
  assert.match(v.html, /role="tablist"/);
  assert.ok(elements(v.html, "button").some((b) => b.attrs.role === "tab" && /Overall fairness/.test(b.text)));
});

test("EventDetail: without a framing review, no highlights and no review box", () => {
  const v = render(opened("sykes-picot-agreement", { framing_review: null }));
  assert.equal(elements(v.html, "mark").length, 0);
  assert.doesNotMatch(v.html, /role="tablist"/);
  assert.match(v.text, new RegExp(RAW.get("sykes-picot-agreement").extract.split("\n")[0].slice(0, 40).replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
});

test("EventDetail: a long lead shows two paragraphs; Show full text expands the rest", () => {
  const event = opened("siege-of-adrianople-1912-1913", { framing_review: null });
  const v = render(event);
  const more = elements(v.html, "div").find((d) => d.attrs.id === "event-detail-more");
  assert.ok("hidden" in more.attrs);
  const toggle = elements(v.html, "button").find((b) => b.text === "Show full text");
  assert.equal(toggle.attrs["aria-expanded"], "false");
  assert.equal(toggle.attrs["aria-controls"], "event-detail-more");
  v.find((e) => e.type === "button" && e.props["aria-controls"] === "event-detail-more")[0].props.onClick();
  v.rerender();
  assert.ok(!("hidden" in elements(v.html, "div").find((d) => d.attrs.id === "event-detail-more").attrs));
  assert.equal(elements(v.html, "button").find((b) => b.text === "Show less").attrs["aria-expanded"], "true");
});

test("EventDetail: while the full text loads, the snippet shows and there is no Wikipedia link yet; a failure offers Try again", () => {
  const v = render(loadingLead("siege-of-adrianople-1912-1913"));
  assert.ok(!elements(v.html, "a").some((a) => /event-detail-wiki/.test(a.attrs.class)));
  assert.ok(elements(v.html, "div").some((d) => d.attrs.role === "status"), "a live region for the text's state");

  const retries = [];
  const failed = render(loadingLead("siege-of-adrianople-1912-1913", "error"), { onRetryLead: () => retries.push(1) });
  assert.match(failed.text, /The full text could not be loaded; only the opening is shown\./);
  failed.find((e) => e.type === "button" && e.props.children === "Try again")[0].props.onClick();
  assert.equal(retries.length, 1);
  const noRetry = render(loadingLead("siege-of-adrianople-1912-1913", "error"));
  assert.ok(!buttons(noRetry.html).includes("Try again"));
});
