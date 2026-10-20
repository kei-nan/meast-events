import test from "node:test";
import assert from "node:assert/strict";
import { LABEL_FONT_FAMILY, loadLabelFont } from "./labelFont.js";

const face = (family, fail = false) => {
  const f = { family, loads: 0 };
  f.load = () => {
    f.loads++;
    return fail ? Promise.reject(new Error("network")) : Promise.resolve(f);
  };
  return f;
};

test("loadLabelFont loads every face of the label family, quoted or not, and only those", async () => {
  const faces = [face(`"${LABEL_FONT_FAMILY}"`), face(LABEL_FONT_FAMILY), face("Inter Variable"), face(`'${LABEL_FONT_FAMILY}'`)];
  await loadLabelFont(new Set(faces));
  assert.deepEqual(faces.map((f) => f.loads), [1, 1, 0, 1]);
});

test("loadLabelFont resolves when a face fails, and without a FontFaceSet", async () => {
  await loadLabelFont(new Set([face(LABEL_FONT_FAMILY, true), face(LABEL_FONT_FAMILY)]));
  await loadLabelFont(undefined);
});
