// The binary format of the map's geometry files (data/**/*.tbin): land, land cells,
// boundary decades and shared boundary geometries. scripts/split-data.mjs encodes,
// dataClient.js decodes; the decoded value is the same GeoJSON the files held as
// JSON before (same keys, properties and vertices), with every coordinate rounded
// to 6 decimal places (about 10 cm), so the map and its callers did not change.
//
// Why not JSON: the borders are never simplified (every source vertex is kept),
// so their size can only come from the encoding. Coordinates as integers, delta-
// and varint-coded, and each edge two neighbours share stored once (a topology,
// like TopoJSON) took the first load's border and land files from 157 KB to 82 KB
// and the West Bank Areas A/B/C from 927 KB to 249 KB (brotli, October 2026).
//
// Layout (little-endian):
//   "tbin" 0x01                       magic and format version
//   u32 n, then n bytes of UTF-8 JSON  header: {s: scale, d: doc}, where doc is the
//                                     source document with each geometry replaced by
//                                     its topology object ({type, arcs}, or {type,
//                                     coordinates} in integers for points)
//   varints:
//     arc count, then each arc's point count
//     every arc point as zigzag deltas (x, y) from the previous point, across arcs
//     for every polygon ring, in document order: its start offset (below)
//
// A coordinate is stored as round(v * scale), a whole number, and decoded as
// int / scale. Division, not int * (1 / scale): it gives exactly the double the
// 6-decimal JSON text parses to, while the multiplication is sometimes 1 ulp off.
// scale is 1e6 unless a file's coordinates all fit a coarser one exactly (land-far
// is 2-decimal at the source: scale 100).
//
// Rings are rebuilt from arcs the way topojson-client does (each arc after the first
// drops its first point; ~i is arc i reversed). The topology starts a ring at a
// junction of arcs, not at the source's first vertex, so each ring carries the
// offset k that rotates it back: the source ring is the stitched ring started at k.
//
// The encoder lives here too (so the format is defined in one place) but takes
// topojson-server's `topology` as an argument: the browser bundle only decodes and
// does not ship it. split-data.mjs fails the build unless decoding every file it
// writes gives the source back exactly (geoMismatch).

const MAGIC = [0x74, 0x62, 0x69, 0x6e, 0x01]; // "tbin", version 1
export const MAX_SCALE = 1e6;
const SCALES = [1, 10, 100, 1e3, 1e4, 1e5, MAX_SCALE];
// Zigzag is done in 32-bit integer arithmetic: deltas must stay below 2^30.
const MAX_INT = 2 ** 29 - 1;

const DEPTH = { Point: 0, MultiPoint: 1, LineString: 1, MultiLineString: 2, Polygon: 2, MultiPolygon: 3 };

const zigzag = (n) => (n << 1) ^ (n >> 31);
const unzigzag = (n) => (n >>> 1) ^ -(n & 1);

// The geometries of a document (a FeatureCollection or a bare geometry), in order;
// null geometries are skipped. `replace(geometry, i)` gives each one's stand-in.
function mapGeometries(doc, replace) {
  if (doc?.type === "FeatureCollection") {
    let i = 0;
    return {
      ...doc,
      features: doc.features.map((f) => (f.geometry == null ? f : { ...f, geometry: replace(f.geometry, i++) })),
    };
  }
  return replace(doc, 0);
}

function forEachPosition(coords, depth, fn) {
  if (depth === 0) fn(coords);
  else for (const c of coords) forEachPosition(c, depth - 1, fn);
}

// Every coordinate value of a document's geometries.
export function forEachCoordinate(doc, fn) {
  mapGeometries(doc, (g) => {
    forEachPosition(g.coordinates, DEPTH[g.type], (p) => {
      fn(p[0]);
      fn(p[1]);
    });
    return g;
  });
}

// "+ 0" turns -0 (Math.round of -0.5 and above) into 0: integers have no -0.
const round6 = (v) => Math.round(v * MAX_SCALE) / MAX_SCALE + 0;

// The coarsest scale that stores every coordinate as it reads at 6 decimal places.
export function pickScale(doc) {
  const values = [];
  forEachCoordinate(doc, (v) => values.push(v));
  return SCALES.find((s) => values.every((v) => Math.round(v * s) / s === round6(v)));
}

// `doc` with every coordinate rounded to 6 decimal places: what decoding gives back.
export function roundedTo6(doc) {
  const round = (c, depth) => (depth === 0 ? [round6(c[0]), round6(c[1])] : c.map((x) => round(x, depth - 1)));
  return mapGeometries(doc, (g) => ({ ...g, coordinates: round(g.coordinates, DEPTH[g.type]) }));
}

// --- encoding ------------------------------------------------------------------

class Writer {
  constructor() {
    this.buf = new Uint8Array(1 << 16);
    this.pos = 0;
  }
  ensure(n) {
    if (this.pos + n <= this.buf.length) return;
    const b = new Uint8Array(Math.max(this.buf.length * 2, this.pos + n));
    b.set(this.buf);
    this.buf = b;
  }
  varint(v) {
    this.ensure(5);
    let u = v >>> 0;
    while (u > 0x7f) {
      this.buf[this.pos++] = (u & 0x7f) | 0x80;
      u >>>= 7;
    }
    this.buf[this.pos++] = u;
  }
  bytes(u8) {
    this.ensure(u8.length);
    this.buf.set(u8, this.pos);
    this.pos += u8.length;
  }
  u32(v) {
    this.ensure(4);
    new DataView(this.buf.buffer).setUint32(this.pos, v, true);
    this.pos += 4;
  }
  done() {
    return this.buf.slice(0, this.pos);
  }
}

// The points of a line or ring made of arcs (topojson-client's stitching), as
// indices into the flat point list: arc `a` holds points start[a] .. start[a+1]-1.
function stitch(arcRefs, start) {
  const out = [];
  for (const ref of arcRefs) {
    const a = ref < 0 ? ~ref : ref;
    if (out.length) out.pop();
    if (ref < 0) for (let p = start[a + 1] - 1; p >= start[a]; p--) out.push(p);
    else for (let p = start[a]; p < start[a + 1]; p++) out.push(p);
  }
  return out;
}

// Each polygon ring's arc list, in document order.
function polygonRings(topoGeom) {
  if (topoGeom.type === "Polygon") return topoGeom.arcs;
  if (topoGeom.type === "MultiPolygon") return topoGeom.arcs.flat();
  return [];
}

// `doc` (a FeatureCollection, its extra keys and every feature key kept, or a bare
// geometry) as .tbin bytes. `topology` is topojson-server's; it is called WITHOUT
// quantization (its quantization snaps to a bbox grid and drops coincident points,
// which would change the borders): the coordinates it sees are already integers.
export function encodeGeo(doc, { topology, scale }) {
  // Only {type, coordinates} of the six coordinate types: anything else would not survive.
  mapGeometries(doc, (g) => {
    const keys = Object.keys(g).sort().join(",");
    if (!(g.type in DEPTH) || keys !== "coordinates,type") throw new Error(`geoCodec: unsupported geometry (${g.type}; keys ${keys})`);
    return g;
  });
  scale ??= pickScale(doc);
  if (!SCALES.includes(scale)) throw new Error(`geoCodec: unsupported scale ${scale}`);
  const sourceRings = [];
  const intGeoms = [];
  mapGeometries(doc, (g) => {
    const toInt = (c, depth) => {
      if (depth > 0) return c.map((x) => toInt(x, depth - 1));
      if (c.length !== 2 || !c.every(Number.isFinite)) throw new Error(`geoCodec: position ${JSON.stringify(c)} is not [lon, lat]`);
      const p = [Math.round(c[0] * scale), Math.round(c[1] * scale)];
      if (Math.abs(p[0]) > MAX_INT || Math.abs(p[1]) > MAX_INT) throw new Error(`geoCodec: ${c} out of range at scale ${scale}`);
      return p;
    };
    // Two copies: topology() may rearrange the arrays it is given.
    const rings = toInt(g.coordinates, DEPTH[g.type]);
    if (g.type === "Polygon") sourceRings.push(...rings);
    if (g.type === "MultiPolygon") sourceRings.push(...rings.flat());
    intGeoms.push({ type: g.type, coordinates: toInt(g.coordinates, DEPTH[g.type]) });
    return g;
  });

  const topo = topology({ g: { type: "GeometryCollection", geometries: intGeoms } });
  if (topo.transform) throw new Error("geoCodec: topology was quantized");
  const objects = topo.objects.g.geometries;
  if (objects.length !== intGeoms.length) throw new Error("geoCodec: topology changed the number of geometries");

  const start = [0];
  for (const arc of topo.arcs) start.push(start.at(-1) + arc.length);
  const flat = topo.arcs.flat();

  // Start offsets: the rotation of each stitched ring that is the source ring.
  const offsets = [];
  const stitchedRings = objects.flatMap(polygonRings);
  if (stitchedRings.length !== sourceRings.length) throw new Error("geoCodec: topology changed the number of rings");
  stitchedRings.forEach((refs, r) => {
    const ring = stitch(refs, start).map((p) => flat[p]);
    const want = sourceRings[r];
    const n = ring.length - 1; // closed: the last point repeats the first
    const same = (k) => want.every((q, j) => {
      const p = ring[j === n ? k : (j + k) % n];
      return p[0] === q[0] && p[1] === q[1];
    });
    let k = 0;
    if (want.length !== ring.length) k = -1;
    else while (k < n && !same(k)) k++;
    if (k < 0 || k >= n) throw new Error(`geoCodec: ring ${r} cannot be rebuilt from the topology`);
    offsets.push(k);
  });

  const header = new TextEncoder().encode(JSON.stringify({ s: scale, d: mapGeometries(doc, (_, i) => objects[i]) }));
  const w = new Writer();
  w.bytes(Uint8Array.from(MAGIC));
  w.u32(header.length);
  w.bytes(header);
  w.varint(topo.arcs.length);
  for (const arc of topo.arcs) w.varint(arc.length);
  let px = 0;
  let py = 0;
  for (const [x, y] of flat) {
    w.varint(zigzag(x - px));
    w.varint(zigzag(y - py));
    px = x;
    py = y;
  }
  for (const k of offsets) w.varint(k);
  return w.done();
}

// --- decoding ------------------------------------------------------------------

// .tbin bytes (a Uint8Array or ArrayBuffer) back to the GeoJSON document.
export function decodeGeo(input) {
  const u8 = input instanceof Uint8Array ? input : new Uint8Array(input);
  if (u8.length < MAGIC.length + 4 || MAGIC.some((b, i) => u8[i] !== b)) throw new Error("geoCodec: not a .tbin file");
  const headerLength = new DataView(u8.buffer, u8.byteOffset + MAGIC.length, 4).getUint32(0, true);
  let pos = MAGIC.length + 4;
  const { s: scale, d: doc } = JSON.parse(new TextDecoder().decode(u8.subarray(pos, pos + headerLength)));
  pos += headerLength;
  const varint = () => {
    let v = 0;
    let shift = 0;
    let b;
    do {
      if (pos >= u8.length) throw new Error("geoCodec: truncated file");
      b = u8[pos++];
      v |= (b & 0x7f) << shift;
      shift += 7;
    } while (b & 0x80);
    return v >>> 0;
  };

  const arcCount = varint();
  const start = new Int32Array(arcCount + 1);
  for (let a = 0; a < arcCount; a++) start[a + 1] = start[a] + varint();
  const total = start[arcCount];
  const xs = new Float64Array(total);
  const ys = new Float64Array(total);
  let x = 0;
  let y = 0;
  for (let p = 0; p < total; p++) {
    x += unzigzag(varint());
    y += unzigzag(varint());
    xs[p] = x;
    ys[p] = y;
  }

  const position = (p) => [xs[p] / scale, ys[p] / scale];
  const line = (refs) => stitch(refs, start).map(position);
  const ring = (refs) => {
    const pts = stitch(refs, start);
    const k = varint();
    const n = pts.length - 1;
    const out = new Array(pts.length);
    for (let j = 0; j < n; j++) out[j] = position(pts[(j + k) % n]);
    out[n] = position(pts[k]);
    return out;
  };
  const point = (c) => [c[0] / scale, c[1] / scale];
  const geometry = (o) => {
    switch (o.type) {
      case "Point":
        return { type: o.type, coordinates: point(o.coordinates) };
      case "MultiPoint":
        return { type: o.type, coordinates: o.coordinates.map(point) };
      case "LineString":
        return { type: o.type, coordinates: line(o.arcs) };
      case "MultiLineString":
        return { type: o.type, coordinates: o.arcs.map(line) };
      case "Polygon":
        return { type: o.type, coordinates: o.arcs.map(ring) };
      case "MultiPolygon":
        return { type: o.type, coordinates: o.arcs.map((p) => p.map(ring)) };
      default:
        throw new Error(`geoCodec: unknown geometry type ${o.type}`);
    }
  };
  // Ring offsets are read in document order, the order mapGeometries visits.
  const out = mapGeometries(doc, geometry);
  if (pos !== u8.length) throw new Error("geoCodec: trailing bytes");
  return out;
}

// --- verification --------------------------------------------------------------

// The first difference between two JSON values, as "path: expected vs actual", or
// null when they are identical: same keys, same array lengths, and numbers equal as
// doubles (Object.is, so -0 and 0 differ). Used by split-data.mjs on every file.
export function geoMismatch(expected, actual, at = "$") {
  if (typeof expected === "number" || typeof actual === "number") {
    return Object.is(expected, actual) ? null : `${at}: ${expected} vs ${actual}`;
  }
  if (expected === null || actual === null || typeof expected !== "object" || typeof actual !== "object") {
    return expected === actual ? null : `${at}: ${JSON.stringify(expected)} vs ${JSON.stringify(actual)}`;
  }
  if (Array.isArray(expected) !== Array.isArray(actual)) return `${at}: array vs object`;
  if (Array.isArray(expected)) {
    if (expected.length !== actual.length) return `${at}: length ${expected.length} vs ${actual.length}`;
    for (let i = 0; i < expected.length; i++) {
      const d = geoMismatch(expected[i], actual[i], `${at}[${i}]`);
      if (d) return d;
    }
    return null;
  }
  const ek = Object.keys(expected);
  const ak = Object.keys(actual);
  if (ek.length !== ak.length || ek.some((k) => !Object.hasOwn(actual, k))) return `${at}: keys ${ek} vs ${ak}`;
  for (const k of ek) {
    const d = geoMismatch(expected[k], actual[k], `${at}.${k}`);
    if (d) return d;
  }
  return null;
}

// Number of positions (vertices) in a document's geometries.
export function countPositions(doc) {
  let n = 0;
  forEachCoordinate(doc, () => n++);
  return n / 2;
}
