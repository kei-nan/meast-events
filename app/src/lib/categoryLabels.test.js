import test from "node:test";
import assert from "node:assert/strict";
import { categoryLabel } from "./categoryLabels.js";

test("category labels match the legend and never drop unknown ids", () => {
  assert.equal(categoryLabel("war"), "War");
  assert.equal(categoryLabel("atrocity"), "Atrocity (genocide, massacre, war crime)");
  assert.equal(categoryLabel("famine"), "Famine");
  assert.equal(categoryLabel(""), "");
});
