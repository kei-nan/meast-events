// Static full-lead files: events/v.<version>/full/<bucket>.json holds {id: {extract,
// extract_retrieved_at, ...}} for every event whose id hashes into that bucket.
// Shared by scripts/split-data.mjs (writer), dataClient.js (reader) and
// build-event-pages.mjs, so all agree on the bucket of an id.
//
// Why buckets and not one file per event or per decade: a full lead is up to
// ~10 KB, so a decade chunk carrying them would be several MB and the lite
// list must never download them. One file per event would spend the host's
// file-count limit (20,000 files per deploy on the Workers free plan) twice
// over, since every event already has its own static page. Buckets keep each
// file small and opening one event fetches exactly one of them.
//
// The NUMBER of buckets grows with the dataset (fullBucketCount), so a bucket
// stays around EVENTS_PER_BUCKET events however many events there are. The
// count is chosen at build time and shipped with the data (dataVersion.js,
// events/meta.json); it is part of the versioned path, so a reader can never
// combine one build's count with another build's files.

// 32 events is ~70 KB of JSON (~20 KB compressed) per opened event. Smaller
// buckets would spend more of the per-deploy file limit, which the per-event
// pages already use one file per event of.
export const MIN_BUCKETS = 64;
export const EVENTS_PER_BUCKET = 32;

// A power of two >= MIN_BUCKETS with at most ~EVENTS_PER_BUCKET events per bucket
// on average. Powers of two mean the count (and so every id's bucket) changes
// only when the dataset doubles.
export function fullBucketCount(eventCount) {
  let n = MIN_BUCKETS;
  while (eventCount / n > EVENTS_PER_BUCKET) n *= 2;
  return n;
}

// FNV-1a (32 bit) over the UTF-16 code units of the id, modulo the bucket count.
export function fullBucket(id, buckets) {
  if (!Number.isInteger(buckets) || buckets < 1) throw new Error(`fullBucket: bad bucket count ${buckets}`);
  let h = 0x811c9dc5;
  for (let i = 0; i < id.length; i++) {
    h ^= id.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h % buckets;
}
