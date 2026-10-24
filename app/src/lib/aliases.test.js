import test from "node:test";
import assert from "node:assert/strict";
import { shownAliases } from "./aliases.js";

test("shownAliases: Wikidata's aliases as-is and in order, without repeats of the title or of each other", () => {
  const e = {
    title: "1948 Palestinian expulsion and flight",
    aliases: ["The Arabs of the Land of Israel in the War of Independence", "1948 Palestinian expulsion and flight"],
  };
  assert.deepEqual(shownAliases(e), ["The Arabs of the Land of Israel in the War of Independence"]);
  assert.deepEqual(shownAliases({ title: "Suez Crisis", aliases: ["Suez War", "suez war", "Tripartite Aggression"] }), [
    "Suez War",
    "Tripartite Aggression",
  ]);
  assert.deepEqual(shownAliases({ title: "X" }), []);
  assert.deepEqual(shownAliases(null), []);
});
