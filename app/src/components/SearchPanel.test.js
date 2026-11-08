import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { elements, registerRenderHooks, textOf, view } from "../lib/testing/render.mjs";

// SearchPanel rendered with react-dom/server (lib/testing/render.mjs): its
// status line, scope button, Download, filter tags and notices, for real lite
// records of data/events.json. The open-event view is a lazy chunk and is not
// rendered here (EventDetail.test.js covers it).
globalThis.window ??= { matchMedia: () => ({ matches: false, addEventListener() {}, removeEventListener() {} }), innerHeight: 800 };
globalThis.document ??= { activeElement: null }; // the scope button reads where focus is
registerRenderHooks();
const { default: SearchPanel } = await import("./SearchPanel.jsx");
const { normalizeEvents } = await import("../lib/dataClient.js");
const { publicEvent } = await import("../../scripts/split-data.mjs");
const { inRange: inRangeOf } = await import("./resultsUtil.jsx");

const RAW = JSON.parse(readFileSync(new URL("../../../data/events.json", import.meta.url), "utf8"));
const ALL = normalizeEvents(RAW.map(publicEvent));
const startYear = (e) => Number(e.date_start.slice(0, 4));
const FILTERS = { categories: [], countries: [], scope: "all", inView: false };

function render(over = {}) {
  const calls = { filters: [], query: [] };
  const results = over.results ?? ALL.filter((e) => startYear(e) >= 1948 && startYear(e) <= 1949);
  const v = view(SearchPanel, {
    query: "",
    filters: FILTERS,
    area: null,
    areaMode: "off",
    status: "idle",
    results,
    total: results.length,
    source: "browse",
    counts: null,
    selectedEvent: null,
    mapBorderYear: 1949,
    viewCount: null,
    range: [1948, 1949],
    categoryOptions: ["war", "atrocity"],
    countryOptions: ["Israel/Palestine", "Egypt"],
    onQueryChange: (q) => calls.query.push(q),
    onFiltersChange: (f) => calls.filters.push(f),
    onAreaModeChange() {},
    onAreaChange() {},
    onSelect() {},
    onHover() {},
    onBack() {},
    onRefocus() {},
    onSheetMove() {},
    onSortChange() {},
    onViewChange() {},
    ...over,
  });
  return { v, calls };
}
const status = (html) => textOf(elements(html, "h2").find((h) => /\bsp-status\b/.test(h.attrs.class ?? ""))?.html ?? "");

test("SearchPanel: browsing, the status line counts the events in the selected years; Download offers them", () => {
  const { v } = render();
  const n = ALL.filter((e) => startYear(e) >= 1948 && startYear(e) <= 1949).length;
  assert.equal(status(v.html), `${n} events in the selected years`);
  const dl = elements(v.html, "button").find((b) => /\bsp-download-toggle\b/.test(b.attrs.class ?? ""));
  assert.equal(dl.attrs["aria-label"], `Download these ${n} results`);
  assert.ok(!("disabled" in dl.attrs));
});

test("SearchPanel: a search over the whole timeline offers 'Show the N in selected years' and says so to screen readers", () => {
  const results = ALL.filter((e) => /war/i.test(e.title)).slice(0, 30);
  const inRange = results.filter((e) => inRangeOf(e, [1948, 1949])).length; // the panel's own rule (resultsUtil.jsx)
  assert.ok(inRange > 0 && inRange < results.length, `fixture: some but not all in 1948-1949 (${inRange} of ${results.length})`);
  const { v, calls } = render({ query: "war", status: "ready", source: "search", results, total: results.length });
  assert.match(status(v.html), new RegExp(`^${results.length} results`));
  assert.match(v.html, new RegExp(`>, ${inRange} in selected years<`));
  assert.match(textOf(v.html), new RegExp(`Show the ${inRange} in selected years`));
  v.find((e) => e.type === "button" && e.props.className === "sp-scope-link")[0].props.onClick({ currentTarget: null });
  assert.equal(calls.filters.at(-1).scope, "range");
});

test("SearchPanel: loading and failure states", () => {
  assert.equal(status(render({ eventsLoading: true }).v.html), "Loading events…");
  assert.equal(status(render({ eventsError: new Error("x") }).v.html), "Events could not be loaded - retrying");
  // no Download while the events are not in
  assert.equal(elements(render({ eventsLoading: true }).v.html, "button").filter((b) => /sp-download-toggle/.test(b.attrs.class ?? "")).length, 0);
});

test("SearchPanel: with nothing to save, Download is disabled and says why", () => {
  const { v } = render({ query: "zzz", status: "ready", source: "search", results: [], total: 0 });
  assert.equal(status(v.html), "0 results");
  const dl = elements(v.html, "button").find((b) => /\bsp-download-toggle\b/.test(b.attrs.class ?? ""));
  assert.equal(dl.attrs["aria-label"], "Download (no results to save)");
  assert.ok("disabled" in dl.attrs);
});

test("SearchPanel: a link to no event says so, naming the id", () => {
  const { v } = render({ notFoundId: "no-such-event" });
  assert.match(textOf(v.html), /No event found for this link\./);
  assert.match(v.html, /<code class="sp-notfound-id" dir="auto">no-such-event<\/code>/);
});

test("SearchPanel: the search box is labelled, reads right to left for RTL text, and reports typing", () => {
  const { v, calls } = render();
  const input = elements(v.html, "input").find((i) => i.attrs.type === "text");
  assert.equal(input.attrs.dir, "auto");
  assert.ok(input.attrs.id && new RegExp(`<label[^>]*for="${input.attrs.id}"`).test(v.html), "a <label> names it");
  v.find((e) => e.type === "input" && e.props.type === "text")[0].props.onChange({ target: { value: "suez" } });
  assert.deepEqual(calls.query, ["suez"]);
});
