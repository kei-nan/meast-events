import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { elements, registerRenderHooks, textOf, view } from "../lib/testing/render.mjs";

// ResultsList rendered with react-dom/server (lib/testing/render.mjs), from
// real records of data/events.json as the app lists them (split-data's lite
// record, normalized by lib/dataClient.js).
registerRenderHooks();
const { default: ResultsList } = await import("./ResultsList.jsx");
const { normalizeEvents } = await import("../lib/dataClient.js");
const { publicEvent } = await import("../../scripts/split-data.mjs");

const RAW = JSON.parse(readFileSync(new URL("../../../data/events.json", import.meta.url), "utf8"));
const ALL = normalizeEvents(RAW.map(publicEvent));
const byId = new Map(ALL.map((e) => [e.id, e]));
const pick = (pred) => ALL.find(pred);
const startYear = (e) => Number(e.date_start.slice(0, 4));

function render(results, over = {}) {
  const got = { selected: [], hovered: [] };
  const v = view(ResultsList, {
    results,
    query: "",
    range: [1900, 2026],
    selectedId: null,
    onSelect: (id) => got.selected.push(id),
    onHover: (id) => got.hovered.push(id),
    onFocusInput() {},
    busy: false,
    ...over,
  });
  return { v, got };
}
const rows = (html) => elements(html, "button").filter((b) => /\bsp-row\b/.test(b.attrs.class ?? ""));

test("ResultsList: a row per result with its title, years, countries and category, one tab stop, the open one marked", () => {
  const suez = byId.get("suez-crisis");
  const others = ALL.filter((e) => e.id !== "suez-crisis").slice(0, 4);
  const { v } = render([suez, ...others], { selectedId: "suez-crisis" });
  const r = rows(v.html);
  assert.equal(r.length, 5);
  assert.match(r[0].text, /^Suez Crisis/);
  assert.match(r[0].text, /1956/);
  assert.match(r[0].text, /Egypt/);
  assert.equal(r[0].attrs["aria-current"], "true");
  assert.equal(r.filter((b) => b.attrs.tabindex === "0").length, 1, "one roving tab stop");
  for (const b of r) assert.match(b.attrs["aria-labelledby"], /-title .+-meta$/);
});

test("ResultsList: a row says when its event has no map location, or only an approximate one", () => {
  const nomap = pick((e) => e.location_quality === "none");
  const approx = pick((e) => e.location_quality === "approximate");
  const precise = pick((e) => e.location_quality === "precise");
  const { v } = render([nomap, approx, precise]);
  const [a, b, c] = rows(v.html).map((x) => x.text);
  assert.match(a, /No map location/);
  assert.match(b, /Approximate location/);
  assert.doesNotMatch(c, /No map location|Approximate location/);
});

test("ResultsList: the searched words are marked in titles", () => {
  const { v } = render([byId.get("suez-crisis")], { query: "suez" });
  const marks = elements(v.html, "mark").map((m) => m.text.toLowerCase());
  assert.ok(marks.includes("suez"), JSON.stringify(marks));
});

test("ResultsList: 50 rows, then 'Show more (N remaining)' reveals the rest", () => {
  const sixty = ALL.slice(0, 60);
  const { v } = render(sixty);
  assert.equal(rows(v.html).length, 50);
  assert.match(textOf(v.html), /Show more \(10 remaining\)/);
  v.find((e) => e.type === "button" && e.props.className === "sp-more")[0].props.onClick();
  v.rerender();
  assert.equal(rows(v.html).length, 60);
  assert.doesNotMatch(textOf(v.html), /Show more/);
});

test("ResultsList: browsing years, events begun earlier come last under 'Ongoing, started before', tagged with their start", () => {
  const range = [1950, 1955];
  const inside = ALL.filter((e) => startYear(e) >= 1950 && startYear(e) <= 1955).slice(0, 3);
  const earlier = pick((e) => startYear(e) < 1950 && e.date_end && Number(e.date_end.slice(0, 4)) >= 1950);
  assert.ok(earlier, "a record that began before 1950 and ran into it");
  const { v } = render([...inside, earlier], { range, browse: true });
  const text = textOf(v.html);
  assert.match(text, /Ongoing, started before 1950/);
  assert.match(rows(v.html).at(-1).text, new RegExp(`Ongoing since ${startYear(earlier)}`));
});

test("ResultsList: a search over the whole timeline tags a result outside the selected years", () => {
  const outside = pick((e) => startYear(e) < 1930 && !e.date_end);
  const { v } = render([outside], { range: [1990, 1999] });
  assert.match(rows(v.html)[0].text, /Outside selected years/);
});

test("ResultsList: the Timeline view has its year axis and decade headings", () => {
  const range = [1940, 1969];
  const results = ALL.filter((e) => startYear(e) >= 1940 && startYear(e) <= 1969).slice(0, 20);
  const { v } = render(results, { range, browse: true, layout: "timeline" });
  assert.match(v.html, /role="group" aria-label="Jump to a year in the list"/);
  const jumps = elements(v.html, "button").map((b) => b.attrs["aria-label"]).filter((l) => /^Jump to \d{4}$/.test(l ?? ""));
  assert.ok(jumps.length >= 2, jumps.join(", "));
  const decades = elements(v.html, "h2").map((h) => h.text);
  assert.ok(decades.some((d) => /19[4-6]0s/.test(d)), decades.join(" | "));
});

test("ResultsList: each row gets the list's open and hover handlers", () => {
  const suez = byId.get("suez-crisis");
  const { v, got } = render([suez]);
  // The tree stops at the (memoized) row component; its button calls these with the event's id.
  const row = v.find((e) => e.props?.ev?.id === "suez-crisis")[0];
  row.props.onSelect("suez-crisis");
  row.props.onHover("suez-crisis");
  row.props.onHover(null);
  assert.deepEqual(got.selected, ["suez-crisis"]);
  assert.deepEqual(got.hovered, ["suez-crisis", null]);
});

test("ResultsList: only an empty list that is still loading is busy", () => {
  assert.match(render([], { busy: true }).v.html, /aria-busy="true"/);
  assert.doesNotMatch(render([byId.get("suez-crisis")], { busy: true }).v.html, /aria-busy/);
});
