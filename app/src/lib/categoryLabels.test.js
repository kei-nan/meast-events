import test from "node:test";
import assert from "node:assert/strict";
import { categoryLabel, categoryShortLabel } from "./categoryLabels.js";

test("category labels match the legend and never drop unknown ids", () => {
  assert.equal(categoryLabel("war"), "War");
  assert.equal(categoryLabel("atrocity"), "Atrocity (genocide, massacre, war crime)");
  assert.equal(categoryLabel("famine"), "Famine");
  assert.equal(categoryLabel(""), "");
});

test("short labels drop only the parenthetical gloss", () => {
  assert.equal(categoryShortLabel("atrocity"), "Atrocity");
  assert.equal(categoryShortLabel("war"), "War");
  assert.equal(categoryShortLabel("famine"), "Famine");
});
