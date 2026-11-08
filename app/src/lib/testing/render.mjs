// Test-only helpers for component render tests under `node --test` (no DOM):
// components are imported through viteNodeHooks.mjs (JSX compiled by Vite's
// transform, CSS stubbed), with "react" aliased to renderReact.mjs, and rendered
// to markup with react-dom/server. Tests assert on the text and attributes a
// reader or a screen reader gets, not on whole markup.
//
//   registerRenderHooks({ "../lib/dataClient": stubUrl });   // before importing components
//   const { default: FilterBar } = await import("../components/FilterBar.jsx");
import { register } from "node:module";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { renderHook } from "./fakeReact.mjs";

const RENDER_REACT_URL = new URL("./renderReact.mjs", import.meta.url).href;

/**
 * Renders `Component(props)` (a memo() is unwrapped) to markup inside
 * fakeReact's renderHook, so its effects run after each render and its state
 * persists (renderReact.mjs). Returns the markup, and the element tree the
 * component returned, whose handlers a test can call (find(), then rerender()):
 *
 *   const v = view(FilterBar, props);
 *   v.find((e) => e.type === "button")[0].props.onClick();
 *   v.rerender();   // v.html is the markup after the click
 */
export function view(Component, props) {
  const C = Component.type ?? Component;
  let tree = null;
  let html = "";
  const Probe = () => (tree = C(props));
  const r = renderHook(() => {
    html = renderToStaticMarkup(createElement(Probe));
  });
  return {
    get html() {
      return html;
    },
    get text() {
      return textOf(html);
    },
    find: (pred) => findElements(tree, pred),
    rerender() {
      r.rerender();
      return html;
    },
  };
}

/** Registers viteNodeHooks.mjs with "react" = renderReact.mjs, plus `aliases` ({ specifier: url }). */
export function registerRenderHooks(aliases = {}) {
  register("./viteNodeHooks.mjs", import.meta.url, { data: { aliases: { react: RENDER_REACT_URL, ...aliases } } });
}

/** A module (as a data: URL) whose source is `src`, for `aliases`. */
export const moduleUrl = (src) => `data:text/javascript,${encodeURIComponent(src)}`;

const ENTITIES = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " " };
const decode = (s) =>
  s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e) =>
    e[0] === "#" ? String.fromCodePoint(e[1] === "x" || e[1] === "X" ? parseInt(e.slice(2), 16) : Number(e.slice(1))) : ENTITIES[e] ?? m
  );

/** The text of rendered markup, as read: tags dropped, entities decoded, white space collapsed. */
export const textOf = (html) => decode(html.replace(/<[^>]*>/g, "")).replace(/\s+/g, " ").trim();

/**
 * Every element in rendered markup whose tag is `tag` (e.g. "a", "button"), as
 * { attrs, html, text }: attrs decoded, `html` its inner markup up to the
 * matching close tag (elements of the same tag are not nested in what is tested).
 */
export function elements(html, tag) {
  const out = [];
  const open = new RegExp(`<${tag}(\\s[^>]*)?>`, "g");
  for (const m of html.matchAll(open)) {
    const attrs = {};
    for (const a of (m[1] ?? "").matchAll(/([^\s=]+)(?:="([^"]*)")?/g)) attrs[a[1]] = a[2] === undefined ? "" : decode(a[2]);
    const start = m.index + m[0].length;
    const end = html.indexOf(`</${tag}>`, start);
    const inner = end < 0 ? "" : html.slice(start, end);
    out.push({ attrs, html: inner, text: textOf(inner) });
  }
  return out;
}

/** Lets pending promise callbacks (a stubbed loader's) run; works under mock.timers (setTimeout). */
export const settle = () => new Promise((r) => setImmediate(r));

/**
 * Every React element in an element tree (what a component returns, not
 * rendered further) for which `pred(element)` holds: for reaching a handler
 * such as a button's onClick.
 */
export function findElements(node, pred, out = []) {
  if (Array.isArray(node)) {
    for (const n of node) findElements(n, pred, out);
  } else if (node && typeof node === "object" && "props" in node) {
    if (pred(node)) out.push(node);
    findElements(node.props.children, pred, out);
  }
  return out;
}
