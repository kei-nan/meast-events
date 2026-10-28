// The event categories are listed in three places: the validator (from the class
// table), the app's labels and the map's colors. A category added to one and not
// the others would pass validation yet show unlabeled or in the fallback color.
import { test } from "node:test";
import assert from "node:assert/strict";
import { CATEGORIES } from "./validate.js";
import { CATEGORY_LABELS } from "../../app/src/lib/categoryLabels.js";
import { CATEGORY_COLORS } from "../../app/src/components/mapLayers.js";

const sorted = (ids) => [...ids].sort();

test("validator, labels and map colors list the same categories", () => {
  assert.equal(new Set(CATEGORIES).size, CATEGORIES.length);
  assert.deepEqual(sorted(Object.keys(CATEGORY_LABELS)), sorted(CATEGORIES));
  assert.deepEqual(sorted(Object.keys(CATEGORY_COLORS)), sorted(CATEGORIES));
});
