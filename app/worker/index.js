// The site's Worker script: serves the MCP endpoint at /mcp and the event briefings at
// /ai/context/<id>.json, and hands every other request to the static assets, as before
// (wrangler.jsonc: run_worker_first only for those two paths, so the script never runs for
// a page, a data file or a 404).
//
// The MCP server is read-only and stateless (createMcpHandler: a fresh server per request,
// no Durable Object, no sign-in). A briefing is joined from the store scripts/build-ai-files.mjs
// wrote into dist/ai/store/, read through the ASSETS binding (lib/aiBriefing.js
// assembleBriefing): what a connected AI gets from event_in_context is exactly what a
// browsing AI reads at /ai/context/<id>.json.
import { McpServer } from "@modelcontextprotocol/server";
import { createMcpHandler } from "agents/mcp/server";
import { z } from "zod";
import { ABOUT, GUIDANCE, assembleBriefing } from "../src/lib/aiBriefing.js";
import { searchIndex, SEARCH_LIMIT } from "./search.js";

const ID = /^[a-z0-9][a-z0-9-]{0,200}$/;

async function asset(env, request, path) {
  const res = await env.ASSETS.fetch(new URL(path, request.url));
  if (!res.ok) return null;
  return res.json();
}

// The entries and shared texts are the same for every request to this deployment (a new
// version starts new isolates), so each isolate parses them once.
let store = null;
function sharedStore(env, request) {
  store ??= Promise.all([asset(env, request, "/ai/store/events.json"), asset(env, request, "/ai/store/shared.json")]).then(
    ([entries, shared]) => {
      if (!entries || !shared) throw new Error("AI store missing");
      return { entries, shared };
    }
  );
  store.catch(() => (store = null));
  return store;
}

/** The self-contained briefing for `id`, or null when there is no such event. */
async function briefing(env, request, id) {
  if (!ID.test(id)) return null;
  const record = await asset(env, request, `/ai/store/context/${id}.json`);
  if (!record) return null;
  const { entries, shared } = await sharedStore(env, request);
  return assembleBriefing(record, entries, shared);
}

const text = (value) => ({ content: [{ type: "text", text: JSON.stringify(value) }] });

function createServer(env, request) {
  const server = new McpServer({ name: "middleeast.events", version: "0.1.0" }, { instructions: `${ABOUT}\n\n${GUIDANCE}` });

  server.registerTool(
    "search_events",
    {
      title: "Find events",
      description:
        "Find events on middleeast.events (Middle East, 1900 to now) by words in their title or Wikidata group. " +
        "It matches words, not meaning, and every word must match: send a few words of the likely English Wikipedia " +
        "title (\"Iranian revolution\", \"Gaza famine\"), not a question. " +
        "Returns ids in date order, not by relevance. Then call event_in_context with an id: it returns that event " +
        "with every event around it, which is what to answer from.",
      inputSchema: { query: z.string().min(1).max(200), limit: z.number().int().min(1).max(100).optional() },
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    async ({ query, limit }) => {
      const index = await asset(env, request, "/ai/index.json");
      if (!index) return { isError: true, content: [{ type: "text", text: "The event list could not be loaded." }] };
      const { total, results } = searchIndex(index, query, limit ?? SEARCH_LIMIT);
      return text({
        total,
        shown: results.length,
        note: total
          ? "Date order, not relevance. Call event_in_context with one id: the events around it include those the query did not name."
          : "No title or group has all these words. Search matches words, not meaning: try fewer or different words, such as " +
            "the likely English Wikipedia title of the event or the war it was part of.",
        results,
      });
    }
  );

  server.registerTool(
    "event_in_context",
    {
      title: "Event with the events around it",
      description:
        "One event with every event a fixed rule places around it (same Wikidata conflict groups, same country and " +
        "years), each with its Wikipedia summary's opening, a link, and its framing review, plus how the dataset was " +
        "selected. The rule depends only on the event, never on the question. Read guidance_for_ai in the result.",
      inputSchema: { id: z.string().min(1).max(200).describe("An event id from search_events, e.g. october-7-attacks") },
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    async ({ id }) => {
      const b = await briefing(env, request, id);
      if (!b) return { isError: true, content: [{ type: "text", text: `No event with id "${id}". Use search_events to find one.` }] };
      return text(b);
    }
  );

  return server;
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    if (url.pathname === "/mcp") return createMcpHandler(() => createServer(env, request))(request, env, ctx);
    if (url.pathname.startsWith("/ai/context/")) {
      // Only an exact id is served; anything else under this path is a 404, never handed to the
      // assets (which would resolve "..%2F" and serve another file).
      const m = /^\/ai\/context\/([a-z0-9-]+)\.json$/.exec(url.pathname);
      const b = m && (request.method === "GET" || request.method === "HEAD") ? await briefing(env, request, m[1]) : null;
      if (b) {
        return new Response(request.method === "HEAD" ? null : JSON.stringify(b), {
          headers: { "content-type": "application/json; charset=utf-8", "cache-control": "public, max-age=3600" },
        });
      }
      const page = await env.ASSETS.fetch(new URL("/404.html", request.url));
      // The site's own 404 page, with the headers _headers gives it (CSP and the rest).
      if (page.ok) return new Response(page.body, { status: 404, headers: page.headers });
      return new Response("Not found", { status: 404, headers: { "content-type": "text/plain; charset=utf-8" } });
    }
    return env.ASSETS.fetch(request);
  },
};
