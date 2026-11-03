// lead.js fetchLeads (API continuation), wiki.js fetchLabels (failed chunks), wd-entities.js aliases and MediaWiki API
// error bodies (http.js mediaWikiJson) against a mocked global fetch - no network.
import test from "node:test";
import assert from "node:assert/strict";
import { fetchLeads } from "./lead.js";
import { fetchLabels, fetchCategories } from "./wiki.js";
import { fetchEntities, fetchLabelsCached, p582Open, setDateEndOpen, setWikidataAliases } from "./wd-entities.js";
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
      // Beta's and Gamma's extracts come in later parts than their lastrevid: their revision is checked once more.
      if (url.searchParams.get("prop") === "info") {
        assert.equal(url.searchParams.get("titles"), "Beta|Gamma");
        return json({ query: { pages: [page("Beta"), page("Gamma")] } });
      }
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
      assert.equal(calls.length, 4); // three parts + one revision check
      assert.equal(leads.get("Alpha").extract, "Alpha lead.");
      assert.equal(leads.get("Beta war").extract, "Beta lead.\n\nMore.");
      assert.equal(leads.get("Beta war").title, "Beta");
      assert.equal(leads.get("Beta war").redirected_from, "Beta war");
      assert.equal(leads.get("Gamma").extract, "Gamma lead.");
      assert.equal(leads.get("Gamma").wikibase_item, "Q5");
    }
  );
});

// Real continued parts do not repeat lastrevid/revisions (the `continue` value lists info|revisions as done), so the
// revid comes from part 1 and the extract from part 2.
const leadPage = (title, { extract, revid } = {}) => ({
  pageid: 7,
  title,
  ...(extract !== undefined ? { extract } : {}),
  ...(revid !== undefined ? { lastrevid: revid, revisions: [{ revid, timestamp: `2026-11-0${revid % 9 || 1}T00:00:00Z` }] } : {}),
  canonicalurl: `https://en.wikipedia.org/wiki/${title}`,
});

test("fetchLeads: an article edited between the revid part and the extract part is fetched again", async () => {
  // Revision 100 when part 1 is served, 101 (new text) from then on.
  let rev = 100;
  await withFetch(
    (url) => {
      if (url.searchParams.get("prop") === "info") return json({ query: { pages: [{ title: "Alpha", lastrevid: rev }] } });
      const cont = url.searchParams.get("excontinue");
      if (cont == null) {
        const r = rev;
        rev = 101; // edited right after part 1 was served
        // A single title on the retry: the extract fits in the first part, with its own revid.
        if (url.searchParams.get("titles") === "Alpha" && r === 101) {
          return json({ batchcomplete: true, query: { pages: [leadPage("Alpha", { revid: 101, extract: "New text." })] } });
        }
        return json({
          continue: { excontinue: "1", continue: "||info|revisions" },
          query: { pages: [leadPage("Alpha", { revid: r }), leadPage("Other", { revid: 5, extract: "Other text." })] },
        });
      }
      return json({ batchcomplete: true, query: { pages: [leadPage("Alpha", { extract: "New text." }), leadPage("Other")] } });
    },
    async (calls) => {
      const leads = await fetchLeads(["Alpha", "Other"], { delayMs: 0 });
      // parts 1-2, the revision check (101 != 100), the retry
      assert.equal(calls.length, 4, calls.join("\n"));
      assert.equal(leads.get("Alpha").extract, "New text.");
      assert.equal(leads.get("Alpha").lastrevid, 101);
      assert.equal(leads.get("Alpha").lastrev_timestamp, "2026-11-02T00:00:00Z");
      assert.equal(leads.get("Other").lastrevid, 5);
    }
  );
});

test("fetchLeads: an unchanged revid after the extract part needs no retry", async () => {
  await withFetch(
    (url) => {
      if (url.searchParams.get("prop") === "info") return json({ query: { pages: [{ title: "Alpha", lastrevid: 100 }] } });
      if (url.searchParams.get("excontinue") == null) {
        return json({ continue: { excontinue: "1", continue: "||info|revisions" }, query: { pages: [leadPage("Alpha", { revid: 100 })] } });
      }
      return json({ batchcomplete: true, query: { pages: [leadPage("Alpha", { extract: "Text." })] } });
    },
    async (calls) => {
      const leads = await fetchLeads(["Alpha"], { delayMs: 0 });
      assert.equal(calls.length, 3);
      assert.equal(leads.get("Alpha").lastrevid, 100);
      assert.equal(leads.get("Alpha").extract, "Text.");
    }
  );
});

test("fetchLeads: an article that keeps changing throws and nothing is cached", async () => {
  const cache = memoryCache();
  let rev = 100;
  await withFetch(
    (url) => {
      rev++;
      if (url.searchParams.get("prop") === "info") return json({ query: { pages: [{ title: "Alpha", lastrevid: rev }] } });
      if (url.searchParams.get("excontinue") == null) {
        return json({ continue: { excontinue: "1", continue: "||info|revisions" }, query: { pages: [leadPage("Alpha", { revid: rev })] } });
      }
      return json({ batchcomplete: true, query: { pages: [leadPage("Alpha", { extract: `Text ${rev}.` })] } });
    },
    async () => assert.rejects(fetchLeads(["Alpha"], { cache, delayMs: 0 }), /Alpha changed while the lead was being fetched/)
  );
  assert.equal(cache.data.size, 0);
});

test("fetchLeads: a missing page is not cached, and a cached null is asked again", async () => {
  const cache = memoryCache();
  cache.set("Stale", null); // written by an earlier version
  await withFetch(
    (url) => {
      const titles = url.searchParams.get("titles").split("|");
      return json({
        query: { pages: titles.map((t) => (t === "Nope" ? { title: t, missing: true } : leadPage(t, { revid: 3, extract: `${t} text.` }))) },
      });
    },
    async (calls) => {
      const leads = await fetchLeads(["Nope", "Stale"], { cache, delayMs: 0 });
      assert.equal(calls.length, 1);
      assert.equal(new URL(calls[0]).searchParams.get("titles"), "Nope|Stale");
      assert.equal(leads.get("Nope"), null);
      assert.equal(leads.get("Stale").extract, "Stale text.");
      assert.equal(cache.data.has("Nope"), false);
      assert.equal(cache.get("Stale").lastrevid, 3);
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

test("p582Open: an end time stated as no value / unknown value, never when a date is given; deprecated ignored", () => {
  const st = (snaktype, rank = "normal") => ({ rank, mainsnak: { snaktype, ...(snaktype === "value" ? { datavalue: { value: { time: "+2024-12-08T00:00:00Z" } } } : {}) } });
  assert.equal(p582Open(undefined), undefined); // claims not fetched
  assert.equal(p582Open({}), null);
  assert.equal(p582Open({ P582: [st("novalue")] }), "novalue");
  assert.equal(p582Open({ P582: [st("somevalue")] }), "somevalue");
  assert.equal(p582Open({ P582: [st("somevalue"), st("value")] }), null);
  // As Q137612545 (2025-2026 Iranian protests) had it, checked 2026-10-30: one deprecated "unknown value".
  assert.equal(p582Open({ P582: [st("somevalue", "deprecated")] }), null);
});

test("setDateEndOpen: only without date_end; undefined (not fetched) leaves the event unchanged", () => {
  const ev = { id: "a", date_end: null };
  assert.equal(setDateEndOpen(ev, "novalue"), true);
  assert.equal(ev.date_end_open, "wikidata_novalue");
  assert.equal(setDateEndOpen(ev, "novalue"), false);
  assert.equal(setDateEndOpen(ev, undefined), false);
  assert.equal(ev.date_end_open, "wikidata_novalue");
  assert.equal(setDateEndOpen(ev, "somevalue"), true);
  assert.equal(ev.date_end_open, "wikidata_somevalue");
  assert.equal(setDateEndOpen(ev, null), true);
  assert.equal("date_end_open" in ev, false);
  const ended = { id: "b", date_end: "2020-01-01" };
  assert.equal(setDateEndOpen(ended, "novalue"), false);
  assert.equal("date_end_open" in ended, false);
});
