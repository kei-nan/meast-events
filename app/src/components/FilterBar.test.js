import test from "node:test";
import assert from "node:assert/strict";
import { elements, registerRenderHooks, view } from "../lib/testing/render.mjs";

// FilterBar rendered with react-dom/server (lib/testing/render.mjs); its
// handlers are called from the element tree it returns.
registerRenderHooks();
const { default: FilterBar } = await import("./FilterBar.jsx");

const FILTERS = { categories: [], countries: [], scope: "all" };

function render(over = {}) {
  const changes = [];
  const props = {
    filters: FILTERS,
    onFiltersChange: (f) => changes.push(f),
    categoryOptions: ["war", "protest", "regional-x"],
    countryOptions: ["Iraq", "regional"],
    ...over,
  };
  return { v: view(FilterBar, props), changes };
}

test("FilterBar: one labelled, pressable chip per category, pressed when it is filtered on", () => {
  const { v } = render({ filters: { ...FILTERS, categories: ["protest"] } });
  const chips = elements(v.html, "button").filter((b) => /\bsp-chip--cat\b/.test(b.attrs.class));
  assert.deepEqual(
    chips.map((b) => [b.text, b.attrs["aria-pressed"]]),
    [
      ["War", "false"],
      ["Protest (protest, demonstration, riot)", "true"],
      // a category without a label of its own is capitalised, not dropped
      ["Regional-x", "false"],
    ]
  );
  assert.match(v.html, /<legend>Category<\/legend>/);
});

test("FilterBar: pressing a chip adds the category, pressing it again removes it; other filters are kept", () => {
  const { v, changes } = render({ filters: { ...FILTERS, categories: ["war"], scope: "range" } });
  const chip = (label) => v.find((e) => e.type === "button" && [e.props.children].flat().includes(label))[0];
  chip("Protest (protest, demonstration, riot)").props.onClick();
  chip("War").props.onClick();
  assert.deepEqual(changes, [
    { categories: ["war", "protest"], countries: [], scope: "range" },
    { categories: [], countries: [], scope: "range" },
  ]);
});

test("FilterBar: with no country chosen, the select offers every country under its display label, with its note", () => {
  const { v, changes } = render();
  const fieldset = elements(v.html, "fieldset").find((f) => /<legend>Country<\/legend>/.test(f.html));
  assert.equal(fieldset.attrs["aria-describedby"], "sp-country-note");
  assert.match(v.html, /<span>Add a country<\/span>/);
  const options = elements(elements(v.html, "select")[0].html, "option").map((o) => [o.attrs.value, o.text]);
  assert.deepEqual(options, [
    ["", "All countries"],
    ["Iraq", "Iraq"],
    ["regional", "Region-wide"],
  ]);
  assert.match(v.html, /id="sp-country-note"[^>]*>Countries are where Wikidata places an event/);
  assert.match(v.html, /With several chosen, an event in any of them is listed\./);
  const onChange = v.find((e) => e.type === "select")[0].props.onChange;
  onChange({ target: { value: "regional" } });
  // the placeholder adds nothing
  onChange({ target: { value: "" } });
  assert.deepEqual(changes.map((f) => f.countries), [["regional"]]);
});

test("FilterBar: a chosen country is a removable tag, the select offers only the others and adds to the list", () => {
  const { v, changes } = render({ filters: { ...FILTERS, countries: ["Iraq"] } });
  const removes = elements(v.html, "button").filter((b) => /\bsp-chip-x\b/.test(b.attrs.class));
  assert.deepEqual(
    removes.map((b) => b.attrs["aria-label"]),
    ["Remove country: Iraq"]
  );
  assert.match(v.html, /<span>Add another<\/span>/);
  const options = elements(elements(v.html, "select")[0].html, "option").map((o) => [o.attrs.value, o.text]);
  assert.deepEqual(options, [
    ["", "Choose…"],
    ["regional", "Region-wide"],
  ]);
  v.find((e) => e.type === "select")[0].props.onChange({ target: { value: "regional" } });
  v.find((e) => e.type === "button" && e.props["aria-label"] === "Remove country: Iraq")[0].props.onClick();
  assert.deepEqual(changes.map((f) => f.countries), [["Iraq", "regional"], []]);
});

test("FilterBar: no country select without countries; the scope toggle only when asked for", () => {
  const { v } = render({ countryOptions: [], showScope: false });
  assert.equal(elements(v.html, "select").length, 0);
  assert.doesNotMatch(v.html, /Search scope/);

  const { v: withScope, changes } = render({ filters: { ...FILTERS, scope: "range" } });
  const seg = elements(withScope.html, "button").filter((b) => /\bsp-seg-btn\b/.test(b.attrs.class));
  assert.deepEqual(
    seg.map((b) => [b.text, b.attrs["aria-pressed"]]),
    [
      ["Whole timeline", "false"],
      ["Only selected years", "true"],
    ]
  );
  assert.match(withScope.html, /role="group" aria-label="Search scope"/);
  withScope.find((e) => e.props.children === "Whole timeline")[0].props.onClick();
  assert.equal(changes[0].scope, "all");
});
