// Writes the files AI tools read into dist/ after the Vite build (postbuild, after
// build-event-pages.mjs):
//
//   dist/ai/store/events.json        each event's entry once (title, dates, links, the
//                                    opening of its summary, its framing review).
//   dist/ai/store/shared.json        the texts every briefing shares (what the site is,
//                                    the guidance, the rule, coverage counts, licences).
//   dist/ai/store/context/<id>.json  what is the event's own: its full summary, its
//                                    selection and the ids lib/conflictContext.js places
//                                    around it.
//   The Worker (worker/index.js) joins these into one self-contained briefing
//   (lib/aiBriefing.js assembleBriefing) for the MCP tool and for /ai/context/<id>.json;
//   no assembled briefing is stored, because each event's entry would be repeated in
//   every context it belongs to (39 MB when they were).
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
import { assembleBriefing, contextRecord, indexEntry, sharedParts, storeEntry, ABOUT, GUIDANCE, REVIEW_METHOD_URL, COVERAGE_REPORT_URL } from "../src/lib/aiBriefing.js";
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
  const STORE = path.join(OUT, "store");
  await mkdir(path.join(STORE, "context"), { recursive: true });
  const info = { version: meta.version, reviewer: review.reviewer, reviewed_on: review.reviewed_on };
  const entries = Object.fromEntries(events.map((e) => [e.id, storeEntry(e)]));
  const shared = sharedParts(funnel, info);
  const sizes = { stored: 0, largestStored: 0, largestServed: 0, largestServedId: null };
  const write = async (file, value) => {
    const json = JSON.stringify(value);
    sizes.stored += Buffer.byteLength(json);
    sizes.largestStored = Math.max(sizes.largestStored, Buffer.byteLength(json));
    await writeFile(file, json);
  };
  await write(path.join(STORE, "events.json"), entries);
  await write(path.join(STORE, "shared.json"), shared);
  for (const e of events) {
    const record = contextRecord(e, ctx.get(e.id), byId);
    // Assemble once here too: a record whose ids are not all in the store fails the build.
    const served = Buffer.byteLength(JSON.stringify(assembleBriefing(record, entries, shared)));
    if (served > sizes.largestServed) Object.assign(sizes, { largestServed: served, largestServedId: e.id });
    await write(path.join(STORE, "context", `${e.id}.json`), record);
  }
  await writeFile(path.join(OUT, "index.json"), JSON.stringify(events.map((e) => indexEntry(e, ctx.get(e.id)))));
  await writeFile(path.join(DIST, "llms.txt"), llmsTxt(events.length));
  const kb = (n) => `${(n / 1024).toFixed(0)}KB`;
  console.log(
    `ai files: store of ${events.length + 2} files (${(sizes.stored / 1048576).toFixed(2)}MB, largest ${kb(sizes.largestStored)}), ` +
      `ai/index.json, llms.txt; largest assembled briefing ${kb(sizes.largestServed)} (${sizes.largestServedId})`
  );
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
