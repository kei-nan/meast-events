import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { topology } from "topojson-server";
import { countPositions, decodeGeo, encodeGeo, geoMismatch, pickScale, roundedTo6 } from "./geoCodec.js";

const encode = (doc, scale) => encodeGeo(doc, { topology, ...(scale ? { scale } : {}) });
const roundTrip = (doc, scale) => decodeGeo(encode(doc, scale));
const fc = (...features) => ({ type: "FeatureCollection", features });
const feature = (geometry, properties = {}) => ({ type: "Feature", properties, geometry });
const square = (x, y, s = 1) => [[x, y], [x + s, y], [x + s, y + s], [x, y + s], [x, y]];

// Exact: same keys and lengths, every number the same double (geoMismatch).
function assertExact(expected, actual) {
  const diff = geoMismatch(expected, actual);
  assert.equal(diff, null, diff);
}

const readJSON = (rel) => JSON.parse(readFileSync(new URL(rel, import.meta.url), "utf8"));

test("real data round-trips exactly, rounded to 6 decimals, with every vertex", () => {
  // The committed sources split-data.mjs encodes (public/data/ is generated).
  const boundaries = readJSON("../../../data/boundaries.json");
  const land = readJSON("../data/land.json");
  const cellsDir = new URL("../data/land-cells/", import.meta.url);
  const cells = readdirSync(cellsDir).slice(0, 10).map((f) => JSON.parse(readFileSync(new URL(f, cellsDir), "utf8")));
  for (const doc of [boundaries, land, ...cells]) {
    const back = roundTrip(doc);
    assertExact(roundedTo6(doc), back);
    assert.equal(countPositions(back), countPositions(doc));
  }
  // The source has values with more than 6 decimals: they come back rounded.
  let over = 0;
  const visit = (c) => (typeof c === "number" ? (over += Math.round(c * 1e6) / 1e6 !== c) : c.forEach(visit));
  for (const f of boundaries.features) visit(f.geometry.coordinates);
  assert.ok(over > 0);
});

test("a value with more than 6 decimals decodes to the double its 6-decimal text parses to", () => {
  const doc = fc(feature({ type: "LineString", coordinates: [[35.55521145127103, 31.293074890017653], [0.1 + 0.2, -0.0000005]] }));
  const [a, b] = roundTrip(doc).features[0].geometry.coordinates;
  assert.deepEqual(a, [35.555211, 31.293075]);
  assert.ok(Object.is(b[0], 0.3)); // 0.30000000000000004 at 6 decimals
  assert.ok(Object.is(b[1], 0)); // rounds to -0, which integers cannot hold: 0
  assertExact(roundedTo6(doc), roundTrip(doc));
});

test("ring starts are restored where the topology rotates them to a junction", () => {
  // Two squares sharing the edge x=1; each ring starts away from the shared edge's
  // ends, so the topology (which starts rings at junctions) must rotate them.
  const left = [[0.5, 0], [1, 0], [1, 1], [0, 1], [0, 0], [0.5, 0]];
  const right = [[2, 0.5], [2, 1], [1, 1], [1, 0], [2, 0], [2, 0.5]];
  const doc = fc(feature({ type: "Polygon", coordinates: [left] }), feature({ type: "Polygon", coordinates: [right] }));
  // Without the offsets the rings would come back rotated: the case is exercised.
  const topo = topology({ g: { type: "GeometryCollection", geometries: doc.features.map((f) => f.geometry) } });
  const firstArc = topo.arcs[topo.objects.g.geometries[0].arcs[0][0]];
  assert.notDeepEqual(firstArc[0], left[0]);
  assertExact(doc, roundTrip(doc));
});

test("holes, multipolygons, shared edges and a ring that touches itself", () => {
  const outer = square(0, 0, 10);
  const hole = [[2, 2], [2, 4], [4, 4], [4, 2], [2, 2]];
  const touching = [[20, 0], [22, 0], [21, 1], [22, 2], [20, 2], [21, 1], [20, 0]]; // a bow-tie, (21, 1) twice
  const doc = fc(
    feature({ type: "Polygon", coordinates: [outer, hole] }, { name: "with hole" }),
    feature({ type: "Polygon", coordinates: [hole] }, { name: "fills the hole" }),
    feature({ type: "MultiPolygon", coordinates: [[square(10, 0, 5)], [square(30, 30)], [touching]] }, { name: "multi" }),
    // The same geometry twice (as a placeholder repeats a source outline).
    feature({ type: "MultiPolygon", coordinates: [[square(10, 0, 5)], [square(30, 30)], [touching]] }, { name: "copy" })
  );
  assertExact(doc, roundTrip(doc));
});

test("null geometries, geometry_ref features, extra keys and empty properties are kept", () => {
  const doc = {
    type: "FeatureCollection",
    cells: ["10_10", "35_30"],
    cellSize: 5,
    features: [
      { type: "Feature", properties: { name: "Area A", start_year: 2000, end_year: 9999, note: "ā ğ ʿ" }, geometry: null, geometry_ref: "abc#0", bbox: [34.88, 31.35, 35.57, 32.55], minzoom: 7 },
      { type: "Feature", properties: {}, geometry: { type: "Polygon", coordinates: [square(35, 31)] } },
      { type: "Feature", properties: { placeholder_for: ["Area A"], status: null }, geometry: null },
      { type: "Feature", properties: { cell: "35_30" }, geometry: { type: "Polygon", coordinates: [square(36, 31)] }, id: 7 },
    ],
  };
  const back = roundTrip(doc);
  assertExact(doc, back);
  assert.deepEqual(Object.keys(back), Object.keys(doc));
  assert.deepEqual(Object.keys(back.features[0]), Object.keys(doc.features[0]));
});

test("negative coordinates, lines and points", () => {
  const doc = fc(
    feature({ type: "Polygon", coordinates: [[[-70.123456, -33.5], [-70, -33.5], [-70, -33], [-70.123456, -33.5]]] }),
    feature({ type: "LineString", coordinates: [[-179.999999, -89.999999], [179.999999, 89.999999]] }),
    feature({ type: "MultiLineString", coordinates: [[[-1, -1], [1, 1]], [[1, 1], [2, -2]]] }),
    feature({ type: "Point", coordinates: [-0.5, 51.477928] }),
    feature({ type: "MultiPoint", coordinates: [[-1.25, 2.5], [3, -4]] })
  );
  assertExact(doc, roundTrip(doc));
});

test("a bare geometry round-trips too", () => {
  const g = { type: "MultiPolygon", coordinates: [[square(1, 1)], [square(3, 3)]] };
  assertExact(g, roundTrip(g));
});

test("scale: the coarsest that keeps every value at 6 decimals; scale 100 is exact for 2-decimal data", () => {
  const two = fc(feature({ type: "Polygon", coordinates: [[[29.31, -12.07], [30.5, -12.07], [30.5, 1.99], [29.31, -12.07]]] }));
  assert.equal(pickScale(two), 100);
  const bytes = encode(two);
  assertExact(two, decodeGeo(bytes));
  assert.ok(bytes.length < encode(two, 1e6).length);
  assert.equal(pickScale(fc(feature({ type: "Point", coordinates: [1.125, 2] }))), 1000);
  assert.equal(pickScale(fc(feature({ type: "Point", coordinates: [1.1234567, 2] }))), 1e6);
  assert.equal(pickScale(fc(feature({ type: "Point", coordinates: [3, -2] }))), 1);
  assert.equal(pickScale(fc()), 1);
  assertExact(fc(), roundTrip(fc()));
});

test("rejects what it cannot store exactly", () => {
  assert.throws(() => encode(fc(feature({ type: "GeometryCollection", geometries: [] }))), /unsupported geometry/);
  assert.throws(() => encode(fc(feature({ type: "Point", coordinates: [1, 2, 3] }))), /not \[lon, lat\]/);
  assert.throws(() => encode(fc(feature({ type: "Point", coordinates: [1, 2], bbox: [1, 2, 1, 2] }))), /unsupported geometry/);
  assert.throws(() => encode(fc(feature({ type: "Point", coordinates: [1e4, 0] })), 1e6), /out of range/);
  assert.throws(() => encodeGeo(fc(), { topology, scale: 3 }), /unsupported scale/);
});

test("decode rejects a file that is not .tbin, truncated or with trailing bytes", () => {
  const bytes = encode(fc(feature({ type: "Polygon", coordinates: [square(35, 31)] })));
  assert.throws(() => decodeGeo(new TextEncoder().encode('{"type":"FeatureCollection"}')), /not a \.tbin file/);
  assert.throws(() => decodeGeo(bytes.slice(0, bytes.length - 3)), /truncated/);
  const longer = new Uint8Array(bytes.length + 1);
  longer.set(bytes);
  assert.throws(() => decodeGeo(longer), /trailing bytes/);
  assertExact(decodeGeo(bytes), decodeGeo(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.length)));
});

test("geoMismatch: exact keys, lengths and doubles", () => {
  assert.equal(geoMismatch({ a: [1, 2] }, { a: [1, 2] }), null);
  assert.match(geoMismatch({ a: [1, 2] }, { a: [1, 2.0000000000000004] }), /\$\.a\[1\]/);
  assert.match(geoMismatch([0], [-0]), /\$\[0\]/);
  assert.match(geoMismatch({ a: 1 }, { a: 1, b: undefined }), /keys/);
  assert.match(geoMismatch([1, 2], [1]), /length/);
  assert.match(geoMismatch({ a: null }, { a: {} }), /\$\.a/);
});
