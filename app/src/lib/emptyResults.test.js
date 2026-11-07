import test from "node:test";
import assert from "node:assert/strict";
import { emptyResultsText } from "./emptyResults.js";

test("no match anywhere says so for the whole atlas", () => {
  assert.equal(emptyResultsText({ textQuery: "zzz", searching: true, counts: { all: 0, inRange: 0 } }), "No events in this atlas match “zzz”.");
  assert.equal(emptyResultsText({ searching: true, scope: "range", counts: { all: 0, inRange: 0 } }), "No events in this atlas match these filters.");
  // "In map view" trims after counts.all: none at all is still none in the atlas.
  assert.equal(emptyResultsText({ textQuery: "zzz", searching: true, inView: true, counts: { all: 0, inRange: 0 } }), "No events in this atlas match “zzz”.");
});

test("matches outside the selected years are not called no match (/?q=suez&y=1900-1901&scope=range)", () => {
  const text = emptyResultsText({ textQuery: "suez", searching: true, scope: "range", counts: { all: 29, inRange: 0 } });
  assert.equal(text, "No events matching “suez” in the selected years.");
  // /?cat=war&y=1900-1900&scope=range
  assert.equal(
    emptyResultsText({ searching: true, scope: "range", counts: { all: 120, inRange: 0 } }),
    "No events matching these filters in the selected years."
  );
});

test("matches outside the map view say the map view", () => {
  assert.equal(
    emptyResultsText({ textQuery: "suez", searching: true, inView: true, counts: { all: 29, inRange: 3 } }),
    "No events matching “suez” in this map view."
  );
  assert.equal(
    emptyResultsText({ textQuery: "suez", searching: true, inView: true, scope: "range", counts: { all: 29, inRange: 3 } }),
    "No events matching “suez” in the selected years in this map view."
  );
  assert.equal(
    emptyResultsText({ textQuery: "suez", searching: true, inView: true, scope: "range", counts: { all: 29, inRange: 0 } }),
    "No events matching “suez” in the selected years."
  );
});

test("matches the category, country or area filters leave out are not called no match (/?q=suez&cat=famine)", () => {
  const counts = { all: 0, inRange: 0, unfiltered: 29 };
  assert.equal(
    emptyResultsText({ textQuery: "suez", searching: true, counts, filters: { categories: true } }),
    "No events matching “suez” with the category filter."
  );
  assert.equal(
    emptyResultsText({ textQuery: "suez", searching: true, counts, filters: { countries: true, area: true } }),
    "No events matching “suez” with the country and area filters."
  );
  assert.equal(
    emptyResultsText({ textQuery: "suez", searching: true, scope: "range", inView: true, counts, filters: { categories: true, countries: true, area: true } }),
    "No events matching “suez” with the category, country and area filters."
  );
  assert.equal(
    emptyResultsText({ textQuery: "suez", searching: true, offline: true, counts, filters: { categories: true } }),
    "No titles or summaries matching “suez” with the category filter; the full text could not be searched."
  );
  // No match even without the filters: none in the atlas.
  assert.equal(
    emptyResultsText({ textQuery: "zzz", searching: true, counts: { all: 0, inRange: 0, unfiltered: 0 }, filters: { categories: true } }),
    "No events in this atlas match “zzz”."
  );
  // Filters only, no text: nothing outside them to point at.
  assert.equal(
    emptyResultsText({ searching: true, counts: { all: 0, inRange: 0, unfiltered: null }, filters: { categories: true } }),
    "No events in this atlas match these filters."
  );
});

test("with the full text unavailable, no title or summary match is not no event", () => {
  assert.equal(
    emptyResultsText({ textQuery: "abandonment", searching: true, offline: true, counts: { all: 0, inRange: 0 } }),
    "No titles or summaries match “abandonment”; the full text could not be searched."
  );
});

test("the browse list", () => {
  assert.equal(emptyResultsText({}), "No events in the selected years.");
  assert.equal(emptyResultsText({ inView: true }), "No events in the selected years in this map view.");
});
