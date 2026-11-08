import test from "node:test";
import assert from "node:assert/strict";
import { elements, registerRenderHooks, view } from "../lib/testing/render.mjs";

// Timeline's year presets and exact-year fields, rendered with react-dom/server
// (lib/testing/render.mjs); typing and the steppers go through the element
// tree's handlers.
registerRenderHooks();
const { Presets, YearField } = await import("./Timeline.jsx");
const { MAX_YEAR, MIN_YEAR } = await import("../lib/years.js");

test("Presets: a labelled group of year buttons; the one matching the range is pressed", () => {
  const v = view(Presets, { startYear: 1967, endYear: 1967, onPick() {} });
  const group = elements(v.html, "div")[0];
  assert.equal(group.attrs.role, "group");
  assert.equal(group.attrs["aria-label"], "Jump to a year or period");
  const presets = elements(v.html, "button");
  assert.deepEqual(
    presets.map((b) => b.text),
    ["WWI 1914–18", "1948–49", "1956", "1967", "1973", "1979", "1980–88", "1990–91", "2003", "2011", "All years"]
  );
  assert.deepEqual(
    presets.filter((b) => b.attrs["aria-pressed"] === "true").map((b) => b.text),
    ["1967"]
  );
  // the "more" mark is decorative
  assert.match(v.html, /class="timeline-presets-more" aria-hidden="true"/);

  const all = view(Presets, { startYear: MIN_YEAR, endYear: MAX_YEAR, onPick() {} });
  assert.deepEqual(
    elements(all.html, "button").filter((b) => b.attrs["aria-pressed"] === "true").map((b) => b.text),
    ["All years"]
  );
  const none = view(Presets, { startYear: 1967, endYear: 1968, onPick() {} });
  assert.equal(elements(none.html, "button").filter((b) => b.attrs["aria-pressed"] === "true").length, 0);
});

test("Presets: a preset picks its own years", () => {
  const picked = [];
  const v = view(Presets, { startYear: 1900, endYear: 2000, onPick: (p) => picked.push([p.start, p.end]) });
  for (const label of ["WWI 1914–18", "1980–88", "All years"]) {
    v.find((e) => e.type === "button" && e.props.children === label)[0].props.onClick();
  }
  assert.deepEqual(picked, [
    [1914, 1918],
    [1980, 1988],
    [MIN_YEAR, MAX_YEAR],
  ]);
});

function field(handle, startYear = 1950, endYear = 1960) {
  const ranges = [];
  const v = view(YearField, { handle, startYear, endYear, onChangeRange: (s, e) => ranges.push([s, e]) });
  const input = () => v.find((e) => e.type === "input")[0];
  const stepper = (label) => v.find((e) => e.type === "button" && e.props["aria-label"] === label)[0];
  return { v, ranges, input, stepper };
}

test("YearField: a labelled field showing the year, with one-year steppers that stop at the limits", () => {
  const { v } = field("start", 1950, 1960);
  const label = elements(v.html, "label")[0];
  const [input] = elements(v.html, "input");
  assert.equal(label.text, "Start");
  assert.equal(label.attrs.for, input.attrs.id);
  assert.equal(input.attrs.value, "1950");
  assert.equal(input.attrs.inputMode, "numeric");
  assert.equal(input.attrs.maxLength, "4");
  assert.equal(input.attrs["aria-invalid"], undefined);
  const steps = elements(v.html, "button").map((b) => [b.attrs["aria-label"], "disabled" in b.attrs]);
  assert.deepEqual(steps, [
    ["Start year one earlier", false],
    ["Start year one later", false],
  ]);

  // start at the first year: no earlier; start at the end year: no later
  const atMin = field("start", MIN_YEAR, MIN_YEAR);
  assert.deepEqual(
    elements(atMin.v.html, "button").map((b) => "disabled" in b.attrs),
    [true, true]
  );
  const atMax = field("end", 1950, MAX_YEAR);
  assert.deepEqual(
    elements(atMax.v.html, "button").map((b) => [b.attrs["aria-label"], "disabled" in b.attrs]),
    [
      ["End year one earlier", false],
      ["End year one later", true],
    ]
  );
});

test("YearField: a typed valid year applies at once; an invalid one is announced and tied to the field", () => {
  const { v, ranges, input } = field("start", 1950, 1960);
  input().props.onChange({ target: { value: "19" } });
  v.rerender();
  assert.equal(elements(v.html, "input")[0].attrs.value, "19", "the draft shows while typing");
  assert.equal(elements(v.html, "input")[0].attrs["aria-invalid"], undefined, "no error before four digits");
  input().props.onChange({ target: { value: "1955" } });
  v.rerender();
  assert.deepEqual(ranges, [[1955, 1960]]);

  input().props.onChange({ target: { value: "19x70" } });
  v.rerender();
  const [bad] = elements(v.html, "input");
  assert.equal(bad.attrs.value, "1970", "non-digits are dropped");
  assert.equal(bad.attrs["aria-invalid"], "true");
  const alert = elements(v.html, "span").find((s) => s.attrs.role === "alert");
  assert.equal(bad.attrs["aria-describedby"], alert.attrs.id);
  assert.equal(alert.text, "The start year can't be after the end year (1960).");
  assert.deepEqual(ranges, [[1955, 1960]], "an invalid year changes nothing");

  input().props.onBlur();
  v.rerender();
  assert.equal(elements(v.html, "input")[0].attrs.value, "1950", "leaving the field shows the year again");
  assert.equal(elements(v.html, "span").length, 0);
});

test("YearField: steppers and arrow keys move the year by one", () => {
  const { ranges, stepper, input } = field("end", 1950, 1960);
  stepper("End year one later").props.onClick();
  stepper("End year one earlier").props.onClick();
  input().props.onKeyDown({ key: "ArrowUp", preventDefault() {} });
  input().props.onKeyDown({ key: "ArrowDown", preventDefault() {} });
  assert.deepEqual(ranges, [
    [1950, 1961],
    [1950, 1959],
    [1950, 1961],
    [1950, 1959],
  ]);
});
