// Scale benchmark (docs/SCALING.md). Loads a served build in a local Chromium
// browser with mobile-like throttling (Lighthouse "Slow 4G":
// 150 ms RTT, 1.6 Mbps down; CPU 4x slower) and reports:
//   listReady   ms from navigation until the first result row is rendered
//   eventsJson  ms until the events list file finished downloading
//   dataKB      transferred (compressed) KB of /data/* requests during load
//   tbt         total blocking time (sum of long-task time over 50 ms) in the first 15 s
//   heapMB      JS heap after load
//   scrubTbt    blocking time while moving the timeline end handle 20 years, one key press at a time
//   scrubMs     wall time for those 20 steps
// Median of RUNS runs (default 3).
//
//   npm i --no-save playwright-core        (in app/; uses an installed Chrome/Edge, no download)
//   BROWSER=msedge node scripts/scale-test/bench.mjs http://127.0.0.1:5101/ label
import { chromium } from "playwright-core";
const [url, label] = [process.argv[2], process.argv[3]];
const RUNS = Number(process.env.RUNS ?? 3);
const median = (a) => a.slice().sort((x, y) => x - y)[Math.floor(a.length / 2)];
const browser = await chromium.launch({ channel: process.env.BROWSER ?? "chrome", headless: true });
const results = [];
for (let r = 0; r < RUNS; r++) {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const page = await ctx.newPage();
  const cdp = await ctx.newCDPSession(page);
  await cdp.send("Network.enable");
  await cdp.send("Network.setCacheDisabled", { cacheDisabled: true });
  await cdp.send("Network.emulateNetworkConditions", { offline: false, latency: 150, downloadThroughput: (1.6 * 1024 * 1024) / 8, uploadThroughput: (750 * 1024) / 8 });
  await cdp.send("Emulation.setCPUThrottlingRate", { rate: 4 });
  await page.addInitScript(() => {
    window.__long = [];
    new PerformanceObserver((l) => { for (const e of l.getEntries()) window.__long.push([e.startTime, e.duration]); }).observe({ type: "longtask", buffered: true });
  });
  await page.goto(url, { waitUntil: "commit" });
  await page.waitForSelector(".sp-row-title", { timeout: 120000 });
  const listReady = await page.evaluate(() => performance.now());
  await page.waitForTimeout(15000 - Math.min(14000, listReady));
  const load = await page.evaluate(() => {
    const res = performance.getEntriesByType("resource");
    const ev = res.find((e) => /\/data\/events\/(v\.[^/]+\/all\.json|all\.[0-9a-f]+\.json)/.test(e.name));
    const dataKB = res.filter((e) => e.name.includes("/data/")).reduce((n, e) => n + e.transferSize, 0) / 1024;
    const tbt = window.__long.filter(([s]) => s < 15000).reduce((n, [, d]) => n + Math.max(0, d - 50), 0);
    return { eventsJson: ev ? ev.responseEnd : null, dataKB, tbt, heapMB: performance.memory ? performance.memory.usedJSHeapSize / 1048576 : null };
  });
  const before = await page.evaluate(() => window.__long.length);
  const handle = page.locator(".timeline-handle--end");
  await handle.focus();
  const t0 = Date.now();
  for (let i = 0; i < 20; i++) {
    await handle.press("ArrowLeft");
    await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
  }
  const scrubMs = Date.now() - t0;
  const scrubTbt = await page.evaluate((b) => window.__long.slice(b).reduce((n, [, d]) => n + Math.max(0, d - 50), 0), before);
  results.push({ listReady, ...load, scrubTbt, scrubMs });
  await ctx.close();
}
await browser.close();
const m = (k) => { const v = results.map((x) => x[k]).filter((x) => x != null); return v.length ? Math.round(median(v)) : null; };
console.log(JSON.stringify({ label, runs: RUNS, listReady: m("listReady"), eventsJson: m("eventsJson"), dataKB: m("dataKB"), tbt: m("tbt"), heapMB: m("heapMB"), scrubTbt: m("scrubTbt"), scrubMs: m("scrubMs") }));
