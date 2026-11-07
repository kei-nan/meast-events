import test from "node:test";
import assert from "node:assert/strict";
import { MAP_UNAVAILABLE_NOTE, mapUnavailableAfter, needsMapButton } from "./mapUnavailable.js";

test("a failed map disables what needs it, and a map that loads after all enables it again", () => {
  assert.equal(mapUnavailableAfter("failed"), true);
  assert.equal(mapUnavailableAfter("ready"), false);
});

test("a button that needs the map: aria-disabled with the reason and no click without one, the click with one", () => {
  const click = () => {};
  assert.deepEqual(needsMapButton(false, click), { onClick: click });
  const off = needsMapButton(true, click);
  assert.equal(off["aria-disabled"], "true");
  assert.equal(off.onClick, undefined);
  assert.match(off.title, new RegExp(MAP_UNAVAILABLE_NOTE));
});
