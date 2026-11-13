// Writes the files AI tools read into dist/ after the Vite build (postbuild, after
// build-event-pages.mjs):
//
//   dist/ai/context/<id>.json  the event, every event lib/conflictContext.js places around
//                              it, their framing reviews and the dataset's coverage
//                              (lib/aiBriefing.js). The MCP endpoint (worker/index.js)
//                              serves these files as they are.
//   dist/ai/index.json         one line per event (id, title, start, countries, own
//                              Wikidata groups), for finding an id.
//   dist/llms.txt              what the site is and where these files are, for AIs that
//                              browse rather than connect (https://llmstxt.org/).
//
// The input is the data the build just shipped (dist/data/), merged as
// build-event-pages.mjs merges it, so the files say exactly what the pages say.
//
// Run via `npm run build` or `node scripts/build-ai-files.mjs` after `vite build`.
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { briefingFor, indexEntry, ABOUT, GUIDANCE, REVIEW_METHOD_URL, COVERAGE_REPORT_URL } from "../src/lib/aiBriefing.js";
import { resolveContext, contextRule } from "../src/lib/conflictContext.js";
import { fullBucket } from "../src/lib/fullBucket.js";
import { SITE } from "../src/lib/citation.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DIST = process.env.EVENT_PAGES_DIST ? path.resolve(process.env.EVENT_PAGES_DIST) : path.join(__dirname, "..", "dist");
const DATA = path.join(DIST, "data");
const OUT = path.join(DIST, "ai");

const readJSON = async (file) => JSON.parse(await readFile(file, "utf8"));

export function llmsTxt(count) {
  return `# middleeast.events

> ${ABOUT}

${GUIDANCE}

## For AI tools

- MCP server (Streamable HTTP, read-only, no sign-in): ${SITE}/mcp
  Tools: search_events (find an event id), event_in_context (an event with every event around it and their reviews).
- [Event list](${SITE}/ai/index.json): ${count} events, one line each (id, title, start date, countries, Wikidata groups).
- Event in context: ${SITE}/ai/context/<id>.json, the same data the MCP tool returns. Example: [October 7 attacks](${SITE}/ai/context/october-7-attacks.json).
- Event pages: ${SITE}/event/<id>, with the Wikipedia summary and its framing review.

How events are chosen around an event: ${contextRule()}

## Method

- [How the framing review is made](${REVIEW_METHOD_URL})
- [Which events the dataset includes and misses](${COVERAGE_REPORT_URL})
`;
}

async function main() {
  const meta = await readJSON(path.join(DATA, "events", "meta.json"));
  const dir = path.join(DATA, "events", meta.dir);
  const lite = await readJSON(path.join(dir, "all.json"));
  const buckets = new Map();
  const full = async (id) => {
    const b = fullBucket(id, meta.fullBuckets);
    if (!buckets.has(b)) buckets.set(b, await readJSON(path.join(dir, "full", `${b}.json`)));
    return buckets.get(b)[id];
  };
  const events = [];
  for (const e of lite) {
    const f = await full(e.id);
    if (!f) throw new Error(`event ${e.id}: no full-lead record`);
    events.push({ ...e, ...f });
  }
  const byId = new Map(events.map((e) => [e.id, e]));
  const review = await readJSON(path.join(DATA, "framing-review.json"));
  let funnel = null;
  try {
    funnel = await readJSON(path.join(DATA, "selection-funnel.json"));
  } catch (err) {
    if (err.code !== "ENOENT") throw err;
    console.warn("warning: dist/data/selection-funnel.json missing; AI files have no coverage counts");
  }

  const ctx = resolveContext(events);
  await rm(OUT, { recursive: true, force: true });
  await mkdir(path.join(OUT, "context"), { recursive: true });
  const info = { version: meta.version, reviewer: review.reviewer, reviewed_on: review.reviewed_on };
  let bytes = 0;
  let largest = 0;
  for (const e of events) {
    const json = JSON.stringify(briefingFor(e, ctx.get(e.id), byId, funnel, info));
    bytes += json.length;
    largest = Math.max(largest, json.length);
    await writeFile(path.join(OUT, "context", `${e.id}.json`), json);
  }
  await writeFile(path.join(OUT, "index.json"), JSON.stringify(events.map((e) => indexEntry(e, ctx.get(e.id)))));
  await writeFile(path.join(DIST, "llms.txt"), llmsTxt(events.length));
  console.log(
    `ai files: ${events.length} context files (${(bytes / 1048576).toFixed(1)}MB, largest ${(largest / 1024).toFixed(0)}KB), ai/index.json, llms.txt`
  );
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
