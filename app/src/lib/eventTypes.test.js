import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { EVENT_FIELDS } from "../../../scripts/lib/validate.js";
import { detailFields, publicEvent } from "../../scripts/split-data.mjs";

// eventTypes.js is JSDoc only; these keep its two typedefs equal to the data.
const SRC = readFileSync(new URL("./eventTypes.js", import.meta.url), "utf8");
// The property names of one typedef block. A type can nest braces ({{lat: number}|null}),
// so the type is skipped by counting them.
function properties(typedef) {
  const start = SRC.indexOf(`@typedef {object} ${typedef}\n`); // the whole name ("Event" is also EventRecord's start)
  assert.ok(start >= 0, `${typedef} is defined`);
  const block = SRC.slice(start, SRC.indexOf("*/", start));
  const names = [];
  for (let at = block.indexOf("@property {"); at >= 0; at = block.indexOf("@property {", at + 1)) {
    let i = at + "@property ".length;
    let depth = 0;
    do {
      if (block[i] === "{") depth++;
      else if (block[i] === "}") depth--;
      i++;
    } while (depth > 0 && i < block.length);
    names.push(/^\s*\[?([a-z_]+)/i.exec(block.slice(i))[1]);
  }
  return names;
}

test("EventRecord lists exactly the validator's fields (scripts/lib/validate.js EVENT_FIELDS)", () => {
  assert.deepEqual(properties("EventRecord").sort(), Object.keys(EVENT_FIELDS).sort());
});

test("Event covers every field the app's records carry: the lite record, the full record and leadStatus", () => {
  const RAW = JSON.parse(readFileSync(new URL("../../../data/events.json", import.meta.url), "utf8"));
  const carried = new Set(["snippet", "extract", "extract_retrieved_at", "wikipedia_revid", "wikipedia_revid_timestamp"]);
  for (const k of ["date_precision", "date_end_precision", "framing_review", "part_of", "includes", "related", "leadStatus", "date_end_open"])
    carried.add(k); // the full record's other keys (split-data.mjs) and App's lead status
  for (const e of RAW) {
    for (const k of Object.keys(publicEvent(e))) carried.add(k);
    for (const k of Object.keys(detailFields(e))) carried.add(k);
  }
  const listed = new Set(properties("Event"));
  assert.deepEqual([...carried].filter((k) => !listed.has(k)), [], "fields the app carries that Event does not list");
  assert.deepEqual([...listed].filter((k) => !carried.has(k)), [], "fields Event lists that no record carries");
});
