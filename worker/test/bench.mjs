// Manual CPU benchmark (not part of `npm test`). Times RESP parse + response
// shaping + JSON.stringify in plain Node (same V8 as workerd) for /api/events
// replies of 113 (real dataset size), 500 and 1000 events, in fields=full and
// fields=lite form, plus the boundaries replies.
//
// The 500/1000-event replies are SYNTHESISED in memory (no Redis, no
// credentials needed): realistic multi-byte text, ~600-char extracts.
// If a local redis-stack is reachable (REDIS_HOST/REDIS_PORT, default
// localhost:6390) the real events/boundaries replies are captured and timed too.
//
// Usage: node test/bench.mjs
//
// IMPORTANT: Workers Free allows 10 ms CPU per request (Paid: 30 s default).
// The numbers below are WARM averages of parse+shape+stringify only. A fresh
// isolate also pays JIT warm-up (see "first call") plus TLS handshake and
// socket CPU that this script cannot measure - so anything near 10 ms warm is
// a real risk on the Free plan. Lite mode exists to keep that in budget.
import net from "node:net";
import { performance } from "node:perf_hooks";
import { RespParser, encodeCommand, parseFtSearchWithFields } from "../src/resp-codec.js";
import { boundaryDocToFeatureJson, buildEventsRequest, eventsResponse, LITE_FIELDS, makeSnippet } from "../src/logic.js";

const FREE_LIMIT_MS = 10;

// --- synthetic RESP replies -------------------------------------------------
const enc = new TextEncoder();
const bulk = (s) => {
  const b = enc.encode(String(s));
  return Buffer.concat([Buffer.from(`$${b.length}\r\n`), b, Buffer.from("\r\n")]);
};
const WORDS = "revolution treaty Ottoman Mandate Jerusalem coup d'état campaign Anglo-Iraqi diplomatic uprising economic crisis Saudi Arabia Ba'ath Party résistance Qatar independence—declared".split(" ");
function extract(i) {
  const out = [];
  for (let n = 0; n < 90; n++) out.push(WORDS[(i * 7 + n * 13) % WORDS.length]);
  return out.join(" ") + ".";
}
function syntheticReply(count, lite) {
  const parts = [Buffer.from(`*${1 + count * 2}\r\n:${count}\r\n`)];
  for (let i = 0; i < count; i++) {
    const ex = extract(i);
    const all = {
      id: `synthetic-event-${i}`,
      title: `Synthetic événement ${i} — ${WORDS[i % WORDS.length]}`,
      extract: ex,
      snippet: makeSnippet(ex),
      category: ["war", "treaty", "political"][i % 3],
      countries: ["Saudi Arabia", "Israel/Palestine", "Iraq"].slice(0, 1 + (i % 3)).join(","),
      location_quality: i % 4 ? "approximate" : "precise",
      start_year: String(1900 + (i % 120)),
      end_year: String(1900 + (i % 120)),
      lon: String(30 + (i % 20) + 0.123456),
      lat: String(20 + (i % 15) + 0.654321),
      date_start: `${1900 + (i % 120)}-05-17`,
      date_end: "",
      wikipedia_url: `https://en.wikipedia.org/wiki/Synthetic_${i}`,
      wikidata_qid: `Q${100000 + i}`,
      coordinate_source: i % 4 ? "country-fallback:Iraq" : "wikidata",
      location: "0,0",
    };
    const keys = lite ? LITE_FIELDS : Object.keys(all);
    parts.push(bulk(`ev:x:${all.id}`));
    parts.push(Buffer.from(`*${keys.length * 2}\r\n`));
    for (const k of keys) parts.push(bulk(k), bulk(all[k]));
  }
  return Buffer.concat(parts);
}

// --- timing -----------------------------------------------------------------
function run(name, wire, shape) {
  const chunkSize = 16384; // typical socket read size
  const once = () => {
    const p = new RespParser();
    let reply;
    for (let i = 0; i < wire.length; i += chunkSize) {
      const out = p.feed(wire.subarray(i, i + chunkSize));
      if (out.length) reply = out[0];
    }
    const r = shape(reply);
    return typeof r === "string" ? r : JSON.stringify(r);
  };
  const tc = performance.now();
  once();
  const first = performance.now() - tc; // cold JIT: what a fresh isolate pays
  for (let i = 0; i < 200; i++) once(); // warm up JIT
  const N = 300;
  const t0 = performance.now();
  let len = 0;
  for (let i = 0; i < N; i++) len = once().length;
  const avg = (performance.now() - t0) / N;
  const flag = first > FREE_LIMIT_MS ? "  <-- first call exceeds Workers Free 10 ms CPU" : "";
  console.log(
    `${name.padEnd(34)} wire ${String(wire.length).padStart(8)}B -> json ${String(len).padStart(8)}B | ` +
      `warm ${avg.toFixed(2).padStart(6)} ms | first call ${first.toFixed(2).padStart(6)} ms${flag}`
  );
  return avg;
}

const shapeEvents = (fields) => {
  const req = buildEventsRequest(new URLSearchParams({ fields }));
  return (r) => {
    const res = parseFtSearchWithFields(r);
    return eventsResponse(res.total, res.documents.map((d) => d.value), req);
  };
};
const shapeB = (r) =>
  `{"type":"FeatureCollection","features":[${parseFtSearchWithFields(r).documents.map((d) => boundaryDocToFeatureJson(d.value["$"])).filter(Boolean).join(",")}]}`;

console.log(`Workers Free CPU limit: ${FREE_LIMIT_MS} ms/request (parse+shape+stringify only; excludes TLS/socket CPU)\n`);
for (const n of [500, 1000]) {
  for (const fields of ["full", "lite"]) {
    run(`synthetic events x${n} fields=${fields}`, syntheticReply(n, fields === "lite"), shapeEvents(fields));
  }
}

// --- optional: real replies from a local redis-stack ------------------------
function capture(args) {
  return new Promise((resolve, reject) => {
    const s = net.connect(Number(process.env.REDIS_PORT || 6390), process.env.REDIS_HOST || "localhost");
    const chunks = [];
    const t = setTimeout(() => (s.destroy(), reject(new Error("timeout"))), 3000);
    s.on("connect", () => s.write(encodeCommand(args)));
    s.on("data", (d) => {
      chunks.push(d);
      const p = new RespParser();
      try {
        if (p.feed(Buffer.concat(chunks)).length) {
          clearTimeout(t);
          s.destroy();
          resolve(Buffer.concat(chunks));
        }
      } catch (e) {
        reject(e);
      }
    });
    s.on("error", reject);
  });
}

try {
  const all = "@start_year:[-inf +inf] @end_year:[-inf +inf]";
  const events = await capture(["FT.SEARCH", "idx:events", all, "LIMIT", "0", "1000"]);
  const lite = await capture(["FT.SEARCH", "idx:events", all, "RETURN", String(LITE_FIELDS.length), ...LITE_FIELDS, "LIMIT", "0", "1000"]);
  const b1948 = await capture(["FT.SEARCH", "idx:boundaries", "@start_year:[-inf 1948] @end_year:[1948 +inf]", "LIMIT", "0", "1000", "RETURN", "1", "$"]);
  const bAll = await capture(["FT.SEARCH", "idx:boundaries", "@start_year:[-inf 3000] @end_year:[1000 +inf]", "LIMIT", "0", "1000", "RETURN", "1", "$"]);
  console.log("\nReal replies from local redis-stack:");
  run("events (real) fields=full", events, shapeEvents("full"));
  run("events (real) fields=lite", lite, shapeEvents("lite"));
  run("boundaries 1948", b1948, shapeB);
  run("boundaries ALL (1000-3000)", bAll, shapeB);
} catch (e) {
  console.log(`\n(no local redis-stack reachable - skipped real-reply benchmarks: ${e.message})`);
}
