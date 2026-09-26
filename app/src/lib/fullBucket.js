// Static full-lead files: events/full/<bucket>.json holds {id: {extract,
// extract_retrieved_at}} for every event whose id hashes into that bucket.
// Shared by scripts/split-data.mjs (writer) and dataClient.js (reader), so both
// always agree on the bucket of an id.
//
// Why buckets and not one file per event or per decade: a full lead is up to
// ~10 KB, so a decade chunk carrying them would be several MB and the lite
// list must never download them. One file per event would mean thousands of
// static files; 64 buckets keep each file small (tens of KB) and the file
// count fixed, and opening one event fetches exactly one of them.

export const FULL_BUCKETS = 64;

// FNV-1a (32 bit) over the UTF-16 code units of the id.
export function fullBucket(id) {
  let h = 0x811c9dc5;
  for (let i = 0; i < id.length; i++) {
    h ^= id.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h % FULL_BUCKETS;
}
