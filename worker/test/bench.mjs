// Manual CPU benchmark (not part of `npm test`): captures real reply bytes
// from a local redis-stack and times parse + shaping + JSON.stringify in plain
// Node (same V8 as workerd). Usage: REDIS_HOST=localhost REDIS_PORT=6390 node test/bench.mjs
import net from "node:net";
import { performance } from "node:perf_hooks";
import { RespParser, encodeCommand, parseFtSearchWithFields } from "../src/resp-codec.js";
import { boundaryDocToFeatureJson, hashToEvent } from "../src/logic.js";

function capture(args) {
  return new Promise((resolve, reject) => {
    const s = net.connect(Number(process.env.REDIS_PORT || 6390), process.env.REDIS_HOST || "localhost");
    const chunks = [];
    s.on("connect", () => s.write(encodeCommand(args)));
    s.on("data", (d) => {
      chunks.push(d);
      const p = new RespParser();
      try {
        if (p.feed(Buffer.concat(chunks)).length) {
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
  console.log(`  first call (cold JIT): ${(performance.now() - tc).toFixed(2)} ms`);
  for (let i = 0; i < 200; i++) once(); // warm up JIT
  const cold = [];
  const t0 = performance.now();
  const N = 500;
  let len = 0;
  for (let i = 0; i < N; i++) len = once().length;
  const avg = (performance.now() - t0) / N;
  console.log(`${name}: wire ${wire.length}B -> json ${len}B, warm avg ${avg.toFixed(2)} ms/request`);
  // "cold-ish": first iteration cost in a fresh parser (JIT not warm) is what a fresh isolate pays
  return avg;
}

const events = await capture(["FT.SEARCH", "idx:events", "@start_year:[-inf +inf] @end_year:[-inf +inf]", "LIMIT", "0", "1000"]);
const b1948 = await capture(["FT.SEARCH", "idx:boundaries", "@start_year:[-inf 1948] @end_year:[1948 +inf]", "LIMIT", "0", "1000", "RETURN", "1", "$"]);
const b2000 = await capture(["FT.SEARCH", "idx:boundaries", "@start_year:[-inf 3000] @end_year:[1000 +inf]", "LIMIT", "0", "1000", "RETURN", "1", "$"]);

run("events (whole dataset)", events, (r) => {
  const res = parseFtSearchWithFields(r);
  return { total: res.total, events: res.documents.map((d) => hashToEvent(d.value)) };
});
const shapeB = (r) => `{"type":"FeatureCollection","features":[${parseFtSearchWithFields(r).documents.map((d) => boundaryDocToFeatureJson(d.value["$"])).filter(Boolean).join(",")}]}`;
run("boundaries 1948", b1948, shapeB);
run("boundaries ALL (1000-3000)", b2000, shapeB);

// First-call (cold JIT) cost, fresh process state approximated by one timed run before warmup:
