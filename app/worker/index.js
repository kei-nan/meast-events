// The site's Worker script: serves the MCP endpoint at /mcp and hands every other request
// to the static assets, as before (wrangler.jsonc: run_worker_first only for /mcp, so the
// script never runs for a page, a data file or a 404).
//
// The MCP server is read-only and stateless (createMcpHandler: a fresh server per request,
// no Durable Object, no sign-in). Its tools return the files scripts/build-ai-files.mjs
// wrote into dist/ai/, read through the ASSETS binding: what a connected AI gets is
// exactly what a browsing AI reads at /ai/context/<id>.json.
import { McpServer } from "@modelcontextprotocol/server";
import { createMcpHandler } from "agents/mcp/server";
import { z } from "zod";
import { ABOUT, GUIDANCE } from "../src/lib/aiBriefing.js";
import { searchIndex, SEARCH_LIMIT } from "./search.js";

const ID = /^[a-z0-9][a-z0-9-]{0,200}$/;

async function asset(env, request, path) {
  const res = await env.ASSETS.fetch(new URL(path, request.url));
  if (!res.ok) return null;
  return res.json();
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
          : "No title or group has all these words. Try fewer or different words (titles are English Wikipedia article titles).",
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
      const briefing = ID.test(id) ? await asset(env, request, `/ai/context/${id}.json`) : null;
      if (!briefing) return { isError: true, content: [{ type: "text", text: `No event with id "${id}". Use search_events to find one.` }] };
      return text(briefing);
    }
  );

  return server;
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    if (url.pathname === "/mcp") return createMcpHandler(() => createServer(env, request))(request, env, ctx);
    return env.ASSETS.fetch(request);
  },
};
