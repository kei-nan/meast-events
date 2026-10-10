// lead.js fetchLeads (API continuation) and wiki.js fetchLabels (failed chunks) against a mocked
// global fetch - no network.
import test from "node:test";
import assert from "node:assert/strict";
import { fetchLeads } from "./lead.js";
import { fetchLabels } from "./wiki.js";

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
