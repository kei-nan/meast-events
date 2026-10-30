import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  eventsNear,
  featuresAt,
  geometryContains,
  historyAt,
  pendingRefsAt,
  periodLabel,
  periodOf,
} from "./placeHistory.js";
import { parsePlace, placeLabel, placeToParam, samePlace } from "./placeParam.js";

const square = (x, y, s = 1) => ({
  type: "Polygon",
  coordinates: [[[x, y], [x + s, y], [x + s, y + s], [x, y + s], [x, y]]],
});
const feature = (name, start_year, end_year, geometry, extra = {}) => ({
  type: "Feature",
  properties: { name, start_year, end_year, status: null, note: null, source: "S", ...extra },
  geometry,
});
const names = (periods) => periods.map((p) => `${p.start}-${p.end}: ${p.items.map((i) => `${i.name}${i.status ? ` [${i.status}]` : ""}`).join(" + ") || "-"}`);

test("geometryContains: polygons, holes and multipolygons", () => {
  const holed = { type: "Polygon", coordinates: [square(0, 0, 10).coordinates[0], square(4, 4, 2).coordinates[0]] };
  assert.equal(geometryContains(holed, 1, 1), true);
  assert.equal(geometryContains(holed, 5, 5), false); // in the hole
  assert.equal(geometryContains(holed, 11, 5), false);
  const multi = { type: "MultiPolygon", coordinates: [square(0, 0).coordinates, square(5, 5).coordinates] };
  assert.equal(geometryContains(multi, 5.5, 5.5), true);
  assert.equal(geometryContains(multi, 3, 3), false);
  assert.equal(geometryContains(null, 0, 0), false);
  assert.equal(geometryContains({ type: "Point", coordinates: [0, 0] }, 0, 0), false);
});

test("historyAt: collapses years with the same names and statuses, keeps every record's words", () => {
  const features = [
    feature("Empire", 1886, 1912, square(0, 0, 10), { note: "n1" }),
    feature("Empire", 1913, 1919, square(0, 0, 10), { note: "n1" }),
    feature("Mandate", 1920, 1945, square(0, 0, 10), { status: "mandate", note: "m" }),
    feature("State", 1946, 1969, square(0, 0, 10), { note: "first" }),
    feature("State", 1970, 9999, square(0, 0, 10), { source: "T" }),
    feature("Area (held)", 1967, 9999, square(1, 1), { status: "occupied-administered" }),
    feature("Elsewhere", 1900, 9999, square(50, 50)),
  ];
  const h = historyAt(features, 1.5, 1.5, { minYear: 1900, maxYear: 2026 });
  assert.deepEqual(names(h), [
    "1900-1919: Empire",
    "1920-1945: Mandate [mandate]",
    "1946-1966: State",
    // Overlapping shapes are both listed, by name, as the border popup lists them.
    "1967-2026: Area (held) [occupied-administered] + State",
  ]);
  // One record from 1900 to 1919 (the two Empire features have the same words).
  assert.deepEqual(h[0].items[0].records, [{ start: 1900, end: 1919, note: "n1", source: "S" }]);
  // State changed record in 1970: both records, each with its own years and words.
  assert.deepEqual(h[3].items[1].records, [
    { start: 1967, end: 1969, note: "first", source: "S" },
    { start: 1970, end: 2026, note: null, source: "T" },
  ]);
  // Outside every shape: one period with no items.
  assert.deepEqual(names(historyAt(features, 30, 30, { minYear: 1900, maxYear: 2026 })), ["1900-2026: -"]);
});

test("historyAt: a gap with no shape is a period of its own", () => {
  const features = [feature("A", 1886, 1914, square(0, 0)), feature("B", 1961, 9999, square(0, 0))];
  assert.deepEqual(names(historyAt(features, 0.5, 0.5, { minYear: 1900, maxYear: 2026 })), ["1900-1914: A", "1915-1960: -", "1961-2026: B"]);
});

test("placeholders never count; pending members are named by pendingRefsAt only inside their bbox", () => {
  const features = [
    feature("West Bank", 2000, 9999, square(0, 0), { placeholder_for: ["Area A"] }),
    { type: "Feature", properties: { name: "Area A", start_year: 2000, end_year: 9999 }, geometry: null, geometry_ref: "h#0", bbox: [0, 0, 0.5, 0.5] },
    { type: "Feature", properties: { name: "Area C", start_year: 2000, end_year: 9999 }, geometry: null, geometry_ref: "h#1", bbox: [0.5, 0.5, 1, 1] },
  ];
  assert.deepEqual(featuresAt(features, 0.25, 0.25), []);
  assert.deepEqual(pendingRefsAt(features, 0.25, 0.25), ["h#0"]);
  assert.deepEqual(pendingRefsAt(features, 0.75, 0.75), ["h#1"]);
  assert.deepEqual(pendingRefsAt(features, 5, 5), []);
});

test("periodLabel and periodOf", () => {
  assert.equal(periodLabel({ start: 1900, end: 1918 }, 2026), "1900–1918");
  assert.equal(periodLabel({ start: 1990, end: 1990 }, 2026), "1990");
  assert.equal(periodLabel({ start: 1992, end: 2026 }, 2026), "1992–present");
  assert.equal(periodLabel({ start: 2026, end: 2026 }, 2026), "2026");
  const periods = [{ start: 1900, end: 1918 }, { start: 1919, end: 2026 }];
  assert.equal(periodOf(periods, 1918), periods[0]);
  assert.equal(periodOf(periods, 1950), periods[1]);
  assert.equal(periodOf(periods, 1800), null);
});

test("eventsNear: precise only, within the distance, closest first, ties by id", () => {
  const ev = (id, lon, lat, quality = "precise") => ({ id, title: id, date_start: "2000", location_quality: quality, coordinates: { lon, lat } });
  const list = eventsNear(
    [ev("far", 36, 31.5), ev("b", 35.1, 31), ev("a", 35.1, 31), ev("near", 35.01, 31), ev("approx", 35, 31, "approximate"), { id: "none", location_quality: "none", coordinates: null }],
    35,
    31,
    50
  );
  assert.deepEqual(list.map((e) => e.id), ["near", "a", "b"]);
  assert.equal(list[0].km, 1);
  assert.equal(list[0].bearing, 90);
});

test("the point in the URL: parse, round, compare, label", () => {
  assert.deepEqual(parsePlace("35.2345,31.7767"), { lon: 35.2345, lat: 31.7767 });
  assert.deepEqual(parsePlace("-0.5,-10"), { lon: -0.5, lat: -10 });
  for (const bad of ["", "35", "35,31,1", "200,10", "10,95", "a,b", "35.1.2,31", null]) assert.equal(parsePlace(bad), null, String(bad));
  assert.equal(placeToParam({ lon: 35.234567891, lat: 31.7767 }), "35.23457,31.7767");
  assert.equal(placeToParam(null), null);
  assert.ok(samePlace({ lon: 35.234561, lat: 31 }, { lon: 35.234559, lat: 31 }));
  assert.ok(!samePlace({ lon: 35.2345, lat: 31 }, null));
  assert.equal(placeLabel({ lon: 35.2345, lat: 31.7767 }), "31.78° N, 35.23° E");
  assert.equal(placeLabel({ lon: -1.5, lat: -2 }), "2.00° S, 1.50° W");
});

// ---- the real data (data/boundaries.json, as the map draws it) ----
//
// Expected periods derived from data/boundaries.json with an independent
// point-in-polygon (turf's booleanPointInPolygon) on 2026-10-30, and checked
// against the "Map borders" sections of docs/DATA_POLICY.md.

const DATA = JSON.parse(readFileSync(new URL("../../../data/boundaries.json", import.meta.url), "utf8")).features;
const REAL = { minYear: 1900, maxYear: 2026 };

test("real data: Jerusalem's Old City (35.2345 E, 31.7767 N)", () => {
  assert.deepEqual(names(historyAt(DATA, 35.2345, 31.7767, REAL)), [
    "1900-1919: Ottoman Empire",
    "1920-1947: Mandatory Palestine [mandate]",
    "1948-1949: West Bank (held by Jordan) [occupied-administered]",
    "1950-1966: West Bank (annexed by Jordan) [annexed-unrecognized]",
    "1967-1994: Israel [occupied-territory-included] + West Bank (held by Israel) [occupied-administered]",
    "1995-1999: Israel [occupied-territory-included] + West Bank (held by Israel, phased Oslo transfers) [occupied-administered]",
    "2000-2026: Israel [occupied-territory-included] + West Bank Area C (held by Israel) [occupied-administered]",
  ]);
});

test("real data: Hebron (35.0998 E, 31.5326 N) is in Area A from 2000", () => {
  assert.deepEqual(names(historyAt(DATA, 35.0998, 31.5326, REAL)).slice(-1), [
    "2000-2026: Israel [occupied-territory-included] + West Bank Area A (Palestinian Authority) [autonomous-partial]",
  ]);
});

test("real data: Antakya (36.1606 E, 36.2025 N), the Sanjak of Alexandretta 1922-1938", () => {
  assert.deepEqual(names(historyAt(DATA, 36.1606, 36.2025, REAL)), [
    "1900-1921: Ottoman Empire",
    "1922-1938: Sanjak of Alexandretta (Hatay) [mandate]",
    "1939-2026: Turkey",
  ]);
});

test("real data: Kuwait City (47.9783 E, 29.3759 N): no shape 1915-1960, annexed 1990-1991", () => {
  const h = historyAt(DATA, 47.9783, 29.3759, REAL);
  assert.deepEqual(names(h), [
    "1900-1914: Ottoman Empire",
    "1915-1960: -",
    "1961-1989: Kuwait",
    "1990-1991: Kuwait (annexed by Iraq) [annexed-unrecognized]",
    "1992-2026: Kuwait",
  ]);
  // Kuwait's 1961-1969 record (the neutral-zone note) and its 1970-1989 one are both kept.
  assert.deepEqual(h[2].items[0].records.map((r) => [r.start, r.end, Boolean(r.note)]), [[1961, 1969, true], [1970, 1989, false]]);
  // The words are the data's own.
  const annexed = DATA.find((f) => f.properties.name === "Kuwait (annexed by Iraq)").properties;
  assert.deepEqual(h[3].items[0].records, [{ start: 1990, end: 1991, note: annexed.note, source: annexed.source }]);
});

test("real data: Mosul (43.13 E, 36.34 N)", () => {
  assert.deepEqual(names(historyAt(DATA, 43.13, 36.34, REAL)), [
    "1900-1919: Ottoman Empire",
    "1920-1921: British Mandate of Mesopotamia [mandate]",
    "1922-1932: Kingdom of Iraq (British Mandate) [mandate]",
    "1933-1958: Kingdom of Iraq",
    "1959-2026: Iraq",
  ]);
});

test("real data: Aden (45.0187 E, 12.7855 N): no shape before 1937", () => {
  assert.deepEqual(names(historyAt(DATA, 45.0187, 12.7855, REAL)), [
    "1900-1936: -",
    "1937-1961: Aden Colony and Western Aden Protectorate",
    "1962-1967: Federation of South Arabia",
    "1968-1970: People's Republic of South Yemen",
    "1971-1989: People's Democratic Republic of Yemen",
    "1990-2026: Yemen",
  ]);
});

test("real data: the eastern Mediterranean (33.5 E, 33.5 N) has no shape in any year", () => {
  assert.deepEqual(names(historyAt(DATA, 33.5, 33.5, REAL)), ["1900-2026: -"]);
});

// A second, independent point-in-polygon (winding number, not even-odd crossings)
// for the reference-point check below.
function windingContains(geometry, lon, lat) {
  const ringWinding = (ring) => {
    let wn = 0;
    for (let i = 0; i < ring.length - 1; i++) {
      const [x0, y0] = ring[i];
      const [x1, y1] = ring[i + 1];
      const side = (x1 - x0) * (lat - y0) - (lon - x0) * (y1 - y0);
      if (y0 <= lat) {
        if (y1 > lat && side > 0) wn++;
      } else if (y1 <= lat && side < 0) wn--;
    }
    return wn !== 0;
  };
  const polys = geometry.type === "MultiPolygon" ? geometry.coordinates : [geometry.coordinates];
  return polys.some((p) => ringWinding(p[0]) && !p.slice(1).some(ringWinding));
}

test("real data: at all 280 Wikidata border reference points (on the borders themselves), every year agrees with an independent point-in-polygon", () => {
  const { points } = JSON.parse(readFileSync(new URL("../../../data/border-reference-points.json", import.meta.url), "utf8"));
  assert.ok(points.length >= 200);
  for (const p of points) {
    const h = historyAt(DATA, p.lon, p.lat, REAL);
    // The periods tile the timeline, and neighbours always differ.
    assert.equal(h[0].start, REAL.minYear);
    assert.equal(h.at(-1).end, REAL.maxYear);
    for (let i = 1; i < h.length; i++) {
      assert.equal(h[i].start, h[i - 1].end + 1);
      assert.notDeepEqual(h[i].items.map((x) => [x.name, x.status]), h[i - 1].items.map((x) => [x.name, x.status]));
    }
    const inside = DATA.filter((f) => windingContains(f.geometry, p.lon, p.lat));
    for (const period of h) {
      for (const year of [period.start, period.end]) {
        const expected = [...new Set(inside.filter((f) => f.properties.start_year <= year && year <= f.properties.end_year).map((f) => f.properties.name))].sort();
        assert.deepEqual(period.items.map((i) => i.name).sort(), expected, `${p.label} (${p.id}) ${year}`);
      }
    }
  }
});
