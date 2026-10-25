// Synthetic dataset for scale tests ONLY (never shipped): N events modelled on
// the real data/events.json. The first copy is the real events unchanged; every
// further event takes one real event's shape (category, countries, date
// duration, sitelinks, number of aliases, lead length, whether it has a location)
// with unique ids and QIDs, start years spread over 1900-2026 and coordinates
// jittered by up to half a degree inside the map extent. Boundaries are copied
// unchanged. See docs/SCALING.md.
//
// Its TEXT (title, aliases, lead, hence the snippet) is new for every event:
// word chains drawn from the real titles and leads (a word-pair model), not
// copies. Copies would let brotli replace each repeated title and snippet by a
// short back-reference: 10 copies of the 815 real events compressed to 22 bytes
// per event in the list file against 82 for the real events, so a benchmark on
// them understated the list download about 4-fold. On this text 8,150 events
// compress to about as many bytes per event as the real ones (docs/SCALING.md).
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
const pick = (a) => a[Math.floor(rnd() * a.length)];
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

// A word-pair model: for each word, the words that follow it in the source
// texts (repeated as often as they do), and the words that start a text.
function wordModel(texts) {
  const next = new Map();
  const starts = [];
  for (const t of texts) {
    const words = t.split(/\s+/).filter(Boolean);
    if (!words.length) continue;
    starts.push(words[0]);
    for (let i = 0; i + 1 < words.length; i++) {
      if (!next.has(words[i])) next.set(words[i], []);
      next.get(words[i]).push(words[i + 1]);
    }
  }
  return { next, starts };
}
// About `chars` characters of text from the model (a dead end restarts a chain).
function chain({ next, starts }, chars) {
  const words = [pick(starts)];
  let len = words[0].length;
  while (len < chars) {
    const w = next.get(words.at(-1));
    const word = w ? pick(w) : pick(starts);
    words.push(word);
    len += word.length + 1;
  }
  return words.join(" ");
}
const titles = wordModel(real.flatMap((e) => [e.title, ...(Array.isArray(e.wikidata_aliases) ? e.wikidata_aliases : [])]));
const leads = wordModel(real.map((e) => e.extract ?? ""));
const slug = (s) => s.toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 60);

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
  const title = chain(titles, Math.max(8, b.title.length));
  const aliases = Array.isArray(b.wikidata_aliases) ? b.wikidata_aliases.map((a) => chain(titles, Math.max(4, a.length))) : b.wikidata_aliases;
  events.push({
    ...b,
    id: `${slug(title) || "event"}-${i.toString(36)}`,
    title,
    wikidata_aliases: aliases,
    extract: b.extract ? chain(leads, b.extract.length) : b.extract,
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
