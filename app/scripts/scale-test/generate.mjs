// Synthetic dataset for scale tests ONLY (never shipped): N events cloned from
// the real data/events.json, with unique ids and QIDs, start years spread over
// 1900-2026 (durations kept) and coordinates jittered by up to half a degree
// inside the map extent. Boundaries are copied unchanged. See docs/SCALING.md.
//
//   node app/scripts/scale-test/generate.mjs 10000 <out-dir>
//   ATLAS_DATA_DIR=<out-dir> npm run build      (in app/)
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { MAP_EXTENT } from "../../src/lib/mapExtent.js";

const DATA = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "..", "data");
const [n, out] = [Number(process.argv[2]), process.argv[3]];
if (!Number.isInteger(n) || n < 1 || !out) {
  console.error("usage: generate.mjs <event count> <out dir>");
  process.exit(1);
}
const real = JSON.parse(fs.readFileSync(path.join(DATA, "events.json"), "utf8"));
const [minLon, minLat, maxLon, maxLat] = MAP_EXTENT;
let seed = 42; // deterministic, so runs are comparable
const rnd = () => (seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648;
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

const events = [];
for (let i = 0; i < n; i++) {
  const b = real[i % real.length];
  const k = Math.floor(i / real.length);
  if (k === 0) {
    events.push({ ...b, part_of: undefined });
    continue;
  }
  const y0 = Number(b.date_start.slice(0, 4));
  const y1 = b.date_end ? Number(b.date_end.slice(0, 4)) : y0;
  const ny = 1900 + Math.floor(rnd() * (2026 - 1900 - Math.max(0, y1 - y0)));
  const shift = (d) => (d ? String(Number(d.slice(0, 4)) - y0 + ny).padStart(4, "0") + d.slice(4) : d);
  const c = b.coordinates && typeof b.coordinates.lon === "number"
    ? { lon: clamp(b.coordinates.lon + rnd() - 0.5, minLon, maxLon), lat: clamp(b.coordinates.lat + rnd() - 0.5, minLat, maxLat) }
    : b.coordinates;
  events.push({
    ...b,
    id: `${b.id}-s${k}`,
    title: `${b.title} (s${k})`,
    wikidata_qid: `Q9${k}${i}`,
    date_start: shift(b.date_start),
    date_end: shift(b.date_end),
    coordinates: c,
    part_of: undefined,
  });
}
fs.mkdirSync(out, { recursive: true });
fs.writeFileSync(path.join(out, "events.json"), JSON.stringify(events));
fs.copyFileSync(path.join(DATA, "boundaries.json"), path.join(out, "boundaries.json"));
console.log(`wrote ${events.length} synthetic events to ${out}`);
