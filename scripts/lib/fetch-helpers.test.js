// lead.js fetchLeads (API continuation), wiki.js fetchLabels (failed chunks), wd-entities.js aliases and MediaWiki API
// error bodies (http.js mediaWikiJson) against a mocked global fetch - no network.
import test from "node:test";
import assert from "node:assert/strict";
import { fetchLeads } from "./lead.js";
import { fetchLabels, fetchCategories } from "./wiki.js";
import { fetchEntities, fetchLabelsCached, setWikidataAliases } from "./wd-entities.js";
import { fetchRevisions } from "./rev-lead.js";
import { mediaWikiJson } from "./http.js";

async function withFetch(handler, fn) {
  const real = globalThis.fetch;
  const calls = [];
  globalThis.fetch = async (url, options) => {
    calls.push(String(url));
    return handler(new URL(String(url)), calls.length, options);
  };
  try {
    await fn(calls);
  } finally {
    globalThis.fetch = real;
  }
}
const json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

test("fetchLeads: follows the API's continue until every page has its extract", async () => {
  const page = (title, extract) => ({
    pageid: title.length,
    title,
    ...(extract !== undefined ? { extract } : {}),
    pageprops: { wikibase_item: `Q${title.length}` },
    canonicalurl: `https://en.wikipedia.org/wiki/${title}`,
    lastrevid: 1,
  });
  await withFetch(
    (url) => {
      const cont = url.searchParams.get("excontinue");
      assert.equal(url.searchParams.get("titles"), "Alpha|Beta war|Gamma");
      if (cont == null) {
        // First part: only Alpha's extract fits; the redirect Beta war -> Beta is reported.
        return json({
          continue: { excontinue: "1", continue: "||pageprops|info" },
          query: {
            redirects: [{ from: "Beta war", to: "Beta" }],
            pages: [page("Alpha", "Alpha lead."), page("Beta"), page("Gamma")],
          },
        });
      }
      if (cont === "1") {
        return json({
          continue: { excontinue: "2", continue: "||pageprops|info" },
          query: { redirects: [{ from: "Beta war", to: "Beta" }], pages: [page("Alpha"), page("Beta", "Beta  lead.\n\n\nMore."), page("Gamma")] },
        });
      }
      return json({ batchcomplete: true, query: { pages: [page("Alpha"), page("Beta"), page("Gamma", "Gamma lead.")] } });
    },
    async (calls) => {
      const leads = await fetchLeads(["Alpha", "Beta war", "Gamma"], { delayMs: 0 });
      assert.equal(calls.length, 3);
      assert.equal(leads.get("Alpha").extract, "Alpha lead.");
      assert.equal(leads.get("Beta war").extract, "Beta lead.\n\nMore.");
      assert.equal(leads.get("Beta war").title, "Beta");
      assert.equal(leads.get("Beta war").redirected_from, "Beta war");
      assert.equal(leads.get("Gamma").extract, "Gamma lead.");
      assert.equal(leads.get("Gamma").wikibase_item, "Q5");
    }
  );
});

test("fetchLeads: a missing page is null; an HTTP error throws", async () => {
  await withFetch(
    () => json({ query: { pages: [{ title: "Nope", missing: true }] } }),
    async () => assert.equal((await fetchLeads(["Nope"], { delayMs: 0 })).get("Nope"), null)
  );
  await withFetch(
    () => json({}, 404),
    async () => assert.rejects(fetchLeads(["X"], { delayMs: 0 }), /lead fetch HTTP 404/)
  );
});

test("fetchLabels: labels per chunk of 50; a failed chunk throws instead of being skipped", async () => {
  const qids = Array.from({ length: 60 }, (_, i) => `Q${i + 1}`);
  const entities = (url) =>
    Object.fromEntries(url.searchParams.get("ids").split("|").map((q) => [q, { labels: { en: { value: `label ${q}` } } }]));
  await withFetch(
    (url) => json({ entities: entities(url) }),
    async (calls) => {
      const labels = await fetchLabels(qids);
      assert.equal(calls.length, 2);
      assert.equal(labels.Q1, "label Q1");
      assert.equal(labels.Q60, "label Q60");
    }
  );
  // Second chunk answers 404 (not retried by politeFetch): the whole call fails.
  await withFetch(
    (url, n) => (n === 1 ? json({ entities: entities(url) }) : json({}, 404)),
    async () => assert.rejects(fetchLabels(qids), /labels HTTP 404/)
  );
});

test("fetchEntities: English aliases as values in Wikidata's order, [] when none, undefined when not requested", async () => {
  const entities = {
    Q1: { id: "Q1", sitelinks: {}, aliases: { en: [{ language: "en", value: "July War" }, { language: "en", value: "Second Lebanon War" }] } },
    Q2: { id: "Q2", sitelinks: {}, aliases: {} },
  };
  await withFetch(
    () => json({ entities }),
    async (calls) => {
      const out = await fetchEntities(["Q1", "Q2"], { props: "sitelinks|aliases", delayMs: 0 });
      assert.match(calls[0], /props=sitelinks%7Caliases|props=sitelinks\|aliases/);
      assert.deepEqual(out.get("Q1").aliases, ["July War", "Second Lebanon War"]);
      assert.deepEqual(out.get("Q2").aliases, []);
    }
  );
  await withFetch(
    () => json({ entities: { Q1: { id: "Q1", sitelinks: {} } } }),
    async () => assert.equal((await fetchEntities(["Q1"], { props: "sitelinks", delayMs: 0 })).get("Q1").aliases, undefined)
  );
});

// ---- MediaWiki API errors (HTTP 200 with an `error` body): thrown, never cached as "missing" ----

// A cache with the lib/cache.js interface that records what was stored.
function memoryCache() {
  const data = new Map();
  return { data, has: (k) => data.has(k), get: (k) => data.get(k), set: (k, v) => data.set(k, v), flush() {} };
}
const apiError = (code = "ratelimited", info = "You've exceeded your rate limit.") =>
  new Response(JSON.stringify({ error: { code, info } }), {
    status: 200,
    headers: { "Content-Type": "application/json", "MediaWiki-API-Error": code },
  });

test("mediaWikiJson: returns the body; throws on an error body, on the MediaWiki-API-Error header alone, and on HTTP errors", async () => {
  assert.deepEqual(await mediaWikiJson(json({ query: {} }), "x"), { query: {} });
  await assert.rejects(mediaWikiJson(apiError(), "lead fetch"), /lead fetch: API error ratelimited \(You've exceeded/);
  const headerOnly = new Response("{}", { status: 200, headers: { "MediaWiki-API-Error": "readonly" } });
  await assert.rejects(mediaWikiJson(headerOnly, "x"), /x: API error readonly/);
  await assert.rejects(mediaWikiJson(json({}, 404), "x"), /x HTTP 404/);
});

test("fetchLeads: an API error body throws and nothing is cached", async () => {
  const cache = memoryCache();
  await withFetch(
    () => apiError(),
    async () => assert.rejects(fetchLeads(["Alpha", "Beta"], { cache, delayMs: 0 }), /lead fetch: API error ratelimited/)
  );
  assert.equal(cache.data.size, 0);
});

test("fetchEntities: an API error body throws; earlier batches stay cached, the failed batch is not cached as null", async () => {
  const cache = memoryCache();
  const qids = Array.from({ length: 41 }, (_, i) => `Q${i + 1}`); // two batches (40 + 1)
  await withFetch(
    (url, n) =>
      n === 1
        ? json({ entities: Object.fromEntries(url.searchParams.get("ids").split("|").map((q) => [q, { id: q, sitelinks: {} }])) })
        : apiError("no-such-entity", "Could not find an entity"),
    async () => assert.rejects(fetchEntities(qids, { cache, props: "sitelinks", delayMs: 0 }), /wbgetentities: API error no-such-entity/)
  );
  assert.equal(cache.data.size, 40);
  assert.equal(cache.has("sitelinks::Q41"), false);
  assert.ok([...cache.data.values()].every((v) => v !== null));
});

test("fetchLabelsCached / fetchLabels / fetchCategories / fetchRevisions: an API error body throws (nothing cached)", async () => {
  const cache = memoryCache();
  await withFetch(
    () => apiError(),
    async () => {
      await assert.rejects(fetchLabelsCached(["Q1"], { cache, delayMs: 0 }), /labels: API error ratelimited/);
      await assert.rejects(fetchLabels(["Q1"]), /labels: API error ratelimited/);
      await assert.rejects(fetchCategories("Alpha"), /categories: API error ratelimited/);
      await assert.rejects(fetchRevisions("Alpha", "2020-01-01T00:00:00Z", { delayMs: 0 }), /revisions \(Alpha\): API error ratelimited/);
    }
  );
  assert.equal(cache.data.size, 0);
});

test("setWikidataAliases: sets, replaces or removes the field; undefined (not fetched) leaves it", () => {
  const ev = { id: "a" };
  assert.equal(setWikidataAliases(ev, ["July War"]), true);
  assert.deepEqual(ev.wikidata_aliases, ["July War"]);
  assert.equal(setWikidataAliases(ev, ["July War"]), false);
  assert.equal(setWikidataAliases(ev, undefined), false);
  assert.deepEqual(ev.wikidata_aliases, ["July War"]);
  assert.equal(setWikidataAliases(ev, []), true);
  assert.equal("wikidata_aliases" in ev, false);
});
