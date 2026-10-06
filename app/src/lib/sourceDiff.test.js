import { test } from "node:test";
import assert from "node:assert/strict";
import { diffById } from "./sourceDiff.js";

const state = (pairs) => new Map(pairs);
const items = (pairs) => pairs.map(([id, sig]) => ({ id, sig }));

test("diffById: entering and leaving ids", () => {
  const prev = state([["a", "1"], ["b", "1"], ["c", "1"], ["d", "1"], ["e", "1"]]);
  const d = diffById(prev, items([["b", "1"], ["c", "1"], ["d", "1"], ["e", "1"], ["f", "1"]]));
  assert.equal(d.full, false);
  assert.deepEqual(d.remove, ["a"]);
  assert.deepEqual(d.add, ["f"]);
  assert.deepEqual([...d.sigs.keys()], ["b", "c", "d", "e", "f"]);
});

test("diffById: a changed signature is removed and re-added", () => {
  const prev = state([["a", "1"], ["b", "1"], ["c", "1"]]);
  const d = diffById(prev, items([["a", "1"], ["b", "2"], ["c", "1"]]));
  assert.equal(d.full, false);
  assert.deepEqual(d.remove, ["b"]);
  assert.deepEqual(d.add, ["b"]);
});

test("diffById: no change is an empty diff", () => {
  const prev = state([["a", "1"]]);
  const d = diffById(prev, items([["a", "1"]]));
  assert.deepEqual([d.full, d.remove, d.add], [false, [], []]);
});

test("diffById: mostly changed means a full replacement", () => {
  const prev = state([["a", "1"], ["b", "1"], ["c", "1"], ["d", "1"]]);
  assert.equal(diffById(prev, items([["a", "2"], ["b", "2"], ["c", "2"], ["d", "1"]])).full, true);
  assert.equal(diffById(prev, items([["x", "1"], ["y", "1"], ["z", "1"]])).full, true);
  assert.equal(diffById(new Map(), items([["a", "1"]])).full, true, "first fill");
  assert.equal(diffById(prev, []).full, true, "everything removed");
});

test("diffById: applying the diff to the previous state gives exactly the next state", () => {
  let seed = 7;
  const rnd = () => ((seed = (seed * 48271) % 2147483647) / 2147483647);
  for (let round = 0; round < 50; round++) {
    const prev = new Map();
    for (let i = 0; i < 60; i++) if (rnd() < 0.7) prev.set(`e${i}`, String(Math.floor(rnd() * 3)));
    const next = [];
    for (let i = 0; i < 60; i++) if (rnd() < 0.7) next.push({ id: `e${i}`, sig: String(Math.floor(rnd() * 3)) });
    const d = diffById(prev, next, 1.1); // never full, so the diff itself is exercised
    const applied = new Map(prev);
    for (const id of d.remove) applied.delete(id);
    for (const id of d.add) applied.set(id, d.sigs.get(id));
    assert.deepEqual(new Map([...applied].sort()), new Map([...d.sigs].sort()));
  }
});
