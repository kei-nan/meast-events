import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { DATA_POLICY_URL, inlineParts, knownGapsUrl, matchKnownGaps, parseKnownGaps, words } from "./knownGaps.js";
import { knownGapsData } from "../../scripts/split-data.mjs";

const TABLE = [
  "## Inclusion",
  "",
  "### Known gaps: major events the rule does not reach",
  "",
  "Some well-known events fail the rule because of how Wikidata models them, not because of their significance. They are listed",
  "here, read from their items.",
  "",
  "| Event (QID) | Sitelinks | Why the rule misses it |",
  "|---|---|---|",
  "| Taif Agreement (Q321936) | 24 | No `P17`, `P276`, `P131` or `P625` at all (a \"peace treaty\", dated 1989 at year precision). |",
  "| Yemeni unification ([Q1139876](https://www.wikidata.org/wiki/Q1139876)) | 26 | **Class.** Its only `P31` is \"political union\". |",
  "| Treaty of London (1946) (Q541293) | 10 | `P17` is the United Kingdom \\| London. |",
  "| 1941 Iraqi coup d'état ([Q641205](https://www.wikidata.org/wiki/Q641205)) | 23 | **Place.** See [the list](https://example.org/x). |",
  "| Armenian genocide (Q80034) | 125 | Shown because it is a hand-picked event. |",
  "",
  "After the table.",
  "",
  "## Next section",
].join("\n");

test("parseKnownGaps: the heading's anchor, the introduction's first sentence and every row", () => {
  const { anchor, intro, entries } = parseKnownGaps(TABLE);
  assert.equal(anchor, "known-gaps-major-events-the-rule-does-not-reach");
  assert.deepEqual(intro, [{ text: "Some well-known events fail the rule because of how Wikidata models them, not because of their significance." }]);
  assert.deepEqual(
    entries.map((e) => [e.name, e.qid]),
    [
      ["Taif Agreement", "Q321936"],
      ["Yemeni unification", "Q1139876"],
      ["Treaty of London (1946)", "Q541293"],
      ["1941 Iraqi coup d'état", "Q641205"],
      ["Armenian genocide", "Q80034"],
    ]
  );
  // The reason as written: code, bold and links kept as pieces, nothing reworded; an escaped bar is a bar.
  assert.deepEqual(entries[0].reason.slice(0, 3), [{ text: "No " }, { code: "P17" }, { text: ", " }]);
  assert.deepEqual(entries[1].reason[0], { strong: "Class." });
  assert.deepEqual(entries[2].reason.at(-1), { text: " is the United Kingdom | London." });
  assert.deepEqual(entries[3].reason.at(-2), { link: "the list", url: "https://example.org/x" });
});

test("parseKnownGaps: fails loudly when the section or its table cannot be read", () => {
  assert.throws(() => parseKnownGaps("# Policy\n\nNo such section.\n"), /no "### Known gaps" heading/);
  assert.throws(() => parseKnownGaps(TABLE.replace("Why the rule misses it", "Reason")), /expected "Event \(QID\)" and "Why the rule misses it"/);
  assert.throws(() => parseKnownGaps(TABLE.replace("|---|---|---|", "")), /separator row/);
  assert.throws(() => parseKnownGaps(TABLE.replace("Taif Agreement (Q321936)", "Taif Agreement")), /no "Name \(Q123\)"/);
  assert.throws(() => parseKnownGaps(TABLE.replace("| 24 |", "|")), /row 1 has 2 cells/);
  assert.throws(() => parseKnownGaps(TABLE.replace(/\| Event[\s\S]*?\n\n/, "")), /no table/);
  const noRows = TABLE.split("\n").filter((l) => !/^\| (?!Event)[^-]/.test(l)).join("\n");
  assert.throws(() => parseKnownGaps(noRows), /no rows/);
});

test("the published policy's table parses, and its shown events are left out of the note", () => {
  const md = readFileSync(new URL("../../../docs/DATA_POLICY.md", import.meta.url), "utf8");
  const { entries } = parseKnownGaps(md);
  assert.ok(entries.length >= 10, `${entries.length} rows`);
  assert.ok(entries.some((e) => e.name === "Taif Agreement" && e.qid === "Q321936"));
  const events = JSON.parse(readFileSync(new URL("../../../data/events.json", import.meta.url), "utf8"));
  const data = knownGapsData(md, events);
  const shown = new Set(events.map((e) => e.wikidata_qid));
  assert.ok(data.entries.every((e) => !shown.has(e.qid)));
  assert.ok(!data.entries.some((e) => e.name === "Armenian genocide"));
  assert.ok(data.entries.some((e) => e.name === "Taif Agreement"));
});

test("words: lower case, accents and apostrophes ignored", () => {
  assert.deepEqual(words("1941 Iraqi coup d'état"), ["1941", "iraqi", "coup", "detat"]);
  assert.deepEqual(words("COUP D’ETAT"), ["coup", "detat"]);
  assert.deepEqual(words("Ṭāʾif"), ["taif"]);
});

test("matchKnownGaps: whole words in order, case- and accent-insensitive", () => {
  const { entries } = parseKnownGaps(TABLE);
  const names = (q) => matchKnownGaps(q, entries).map((e) => e.name);
  assert.deepEqual(names("Taif"), ["Taif Agreement"]);
  assert.deepEqual(names("  TAIF agreement "), ["Taif Agreement"]);
  assert.deepEqual(names("Ṭāʾif"), ["Taif Agreement"]);
  assert.deepEqual(names("iraqi coup d'etat"), ["1941 Iraqi coup d'état"]);
  assert.deepEqual(names("treaty of london"), ["Treaty of London (1946)"]);
  // Not part of a word, not out of order, not more words than the name has.
  assert.deepEqual(names("Tai"), []);
  assert.deepEqual(names("Iraq"), []);
  assert.deepEqual(names("agreement Taif"), []);
  assert.deepEqual(names("Taif Agreement 1989"), []);
  // Only common words, or nothing.
  assert.deepEqual(names("of"), []);
  assert.deepEqual(names("the of"), []);
  assert.deepEqual(names(""), []);
  assert.deepEqual(names(null), []);
  // At most `limit`, in the table's order.
  const many = [{ name: "1913 Ottoman coup" }, { name: "1941 Iraqi coup" }, { name: "Coup of 1952" }];
  assert.deepEqual(matchKnownGaps("coup", many, 2).map((e) => e.name), ["1913 Ottoman coup", "1941 Iraqi coup"]);
});

test("inlineParts and knownGapsUrl", () => {
  assert.deepEqual(inlineParts("plain"), [{ text: "plain" }]);
  assert.deepEqual(inlineParts("`P17` x"), [{ code: "P17" }, { text: " x" }]);
  // Only web links are read as links.
  assert.deepEqual(inlineParts("[a](javascript:x)"), [{ text: "[a](javascript:x)" }]);
  assert.equal(knownGapsUrl("known-gaps-x"), `${DATA_POLICY_URL}#known-gaps-x`);
  assert.equal(knownGapsUrl(""), DATA_POLICY_URL);
});
