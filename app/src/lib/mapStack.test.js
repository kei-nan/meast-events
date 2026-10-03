import test from "node:test";
import assert from "node:assert/strict";
import {
  LIST_MAX,
  allSameCoordinates,
  clusterClickAction,
  largestStack,
  eventYearLabel,
  eventsBounds,
  hoverLabel,
  stackItems,
} from "./mapStack.js";

const pt = (lon, lat, properties = {}) => ({
  type: "Feature",
  properties,
  geometry: { type: "Point", coordinates: [lon, lat] },
});

test("eventYearLabel: single year, span, missing", () => {
  assert.equal(eventYearLabel({ date_start: "1937-07-07" }), "1937");
  assert.equal(eventYearLabel({ date_start: "1936-04-19", date_end: "1939-08-01" }), "1936–1939");
  assert.equal(eventYearLabel({ date_start: "1948-05-14", date_end: "1948-12-01" }), "1948");
  assert.equal(eventYearLabel({}), "");
  assert.equal(eventYearLabel(null), "");
});

test("allSameCoordinates", () => {
  assert.equal(allSameCoordinates([]), false);
  assert.equal(allSameCoordinates([pt(35.2137, 31.7683)]), true);
  assert.equal(allSameCoordinates([pt(35.2137, 31.7683), pt(35.2137, 31.7683), pt(35.2137, 31.7683)]), true);
  assert.equal(allSameCoordinates([pt(35.2137, 31.7683), pt(35.2138, 31.7683)]), false);
});

test("clusterClickAction: list stacks, zoom splittable clusters", () => {
  const same = [pt(44.36, 33.31), pt(44.36, 33.31)];
  const spread = [pt(44.36, 33.31), pt(44.5, 33.4)];
  // identical points always list, even when the expansion zoom looks fine
  assert.equal(clusterClickAction({ count: 2, expansionZoom: 6, clusterMaxZoom: 12, leaves: same }), "list");
  // splits within the clustering range -> zoom
  assert.equal(clusterClickAction({ count: 2, expansionZoom: 6, clusterMaxZoom: 12, leaves: spread }), "zoom");
  assert.equal(clusterClickAction({ count: 500, expansionZoom: 4, clusterMaxZoom: 12 }), "zoom");
  // only splits past clusterMaxZoom -> list (if small enough)
  assert.equal(clusterClickAction({ count: 5, expansionZoom: 13, clusterMaxZoom: 12, leaves: spread }), "list");
  assert.equal(clusterClickAction({ count: LIST_MAX + 1, expansionZoom: 13, clusterMaxZoom: 12 }), "zoom");
  // mostly one stack (21 capital-pinned + a few nearby) -> list at once
  const mostly = [...Array(21)].map(() => pt(35.2137, 31.7683)).concat([pt(35.1, 31.6), pt(35.3, 31.9)]);
  assert.equal(clusterClickAction({ count: 23, expansionZoom: 9, clusterMaxZoom: 12, leaves: mostly }), "list");
  // a stack that is only a minority of the cluster -> zoom
  const minority = mostly.concat([...Array(20)].map((_, i) => pt(34 + i / 10, 31)));
  assert.equal(clusterClickAction({ count: 43, expansionZoom: 7, clusterMaxZoom: 12, leaves: minority }), "zoom");
  // leaves truncated (fewer than count) never decide on their own
  assert.equal(clusterClickAction({ count: 80, expansionZoom: 7, clusterMaxZoom: 12, leaves: same }), "zoom");
  // unknown expansion (request failed) -> zoom
  assert.equal(clusterClickAction({ count: 3, expansionZoom: NaN, clusterMaxZoom: 12 }), "zoom");
});

test("largestStack", () => {
  assert.equal(largestStack([]), 0);
  assert.equal(largestStack([pt(1, 1), pt(1, 1), pt(2, 2)]), 2);
});

test("stackItems: dedupes by id, matches first, then by year", () => {
  const items = stackItems([
    pt(0, 0, { id: "b", title: "B", y: "1950", m: 1 }),
    pt(0, 0, { id: "a", title: "A", y: "1920", m: 0 }),
    pt(0, 0, { id: "c", title: "C", y: "1930–1931", m: 1, a: 1 }),
    pt(0, 0, { id: "b", title: "B", y: "1950", m: 1 }),
  ]);
  assert.deepEqual(
    items.map((i) => i.id),
    ["c", "b", "a"]
  );
  assert.equal(items[0].approx, true);
  assert.equal(items[2].match, false);
});

test("hoverLabel", () => {
  assert.equal(hoverLabel({ title: "Suez Crisis", y: "1956" }), "Suez Crisis (1956)");
  assert.equal(hoverLabel({ title: "X" }), "X");
  assert.equal(hoverLabel({ title: "X", y: "1920" }, { stacked: 3 }), "X (1920) + 2 more here — click to list");
  assert.equal(hoverLabel({ point_count: 21 }), "21 events — click to zoom in");
  assert.equal(hoverLabel({ point_count: 21 }, { listable: true }), "21 events — click to list them");
  assert.equal(hoverLabel(null), "");
});

test("eventsBounds: ids filter, skips events without coordinates", () => {
  const events = [
    { id: "a", coordinates: { lon: 35.2, lat: 31.7 } },
    { id: "b", coordinates: { lon: 44.4, lat: 33.3 } },
    { id: "c", coordinates: null },
    { id: "d", coordinates: { lon: 32.5, lat: 29.9 } },
  ];
  assert.deepEqual(eventsBounds(events), { bbox: [32.5, 29.9, 44.4, 33.3], count: 3 });
  assert.deepEqual(eventsBounds(events, new Set(["a", "c"])), { bbox: [35.2, 31.7, 35.2, 31.7], count: 1 });
  assert.equal(eventsBounds(events, new Set(["c"])), null);
  assert.equal(eventsBounds([], null), null);
});
