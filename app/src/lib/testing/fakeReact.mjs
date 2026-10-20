// Test-only stand-in for the few React hooks a map hook uses (useRef, useMemo,
// useEffect, useState), so a hook can be driven under `node --test` with no DOM and no
// renderer. Aliased in for "react" by viteNodeHooks.mjs (`data.aliases`).
//
// Semantics kept from React: hook slots by call order; useMemo/useEffect re-run
// when a dependency changes (Object.is) or when no dependency array is given;
// effects run after the render, in declaration order, each previous cleanup
// first. useState keeps its value per slot, but setting it does not re-render:
// the test calls rerender() to see it. Not modelled: context, batching,
// StrictMode double runs.

let current = null;

const changed = (prev, next) =>
  !prev || !next || prev.length !== next.length || next.some((v, i) => !Object.is(v, prev[i]));

function slot(init) {
  if (!current) throw new Error("hook called outside renderHook");
  const i = current.index++;
  if (!(i in current.slots)) current.slots[i] = init();
  return current.slots[i];
}

export function useRef(initial) {
  return slot(() => ({ current: initial }));
}

export function useState(initial) {
  const s = slot(() => {
    const st = { value: typeof initial === "function" ? initial() : initial };
    st.set = (v) => {
      st.value = typeof v === "function" ? v(st.value) : v;
    };
    return st;
  });
  return [s.value, s.set];
}

export function useMemo(fn, deps) {
  const s = slot(() => ({ deps: null, value: undefined }));
  if (changed(s.deps, deps)) {
    s.value = fn();
    s.deps = deps;
  }
  return s.value;
}

export function useEffect(fn, deps) {
  const s = slot(() => ({ deps: null, cleanup: null }));
  if (!changed(s.deps, deps)) return;
  s.deps = deps;
  current.effects.push(() => {
    if (s.cleanup) s.cleanup();
    const out = fn();
    s.cleanup = typeof out === "function" ? out : null;
  });
}

/** Renders `hook(props)` once; `rerender(props)` renders it again with the same slots. */
export function renderHook(hook, props) {
  const slots = [];
  const render = (p) => {
    current = { slots, index: 0, effects: [] };
    let out;
    let effects;
    try {
      out = hook(p);
      effects = current.effects;
    } finally {
      current = null;
    }
    for (const run of effects) run();
    return out;
  };
  render(props);
  return { rerender: render };
}

export default { useRef, useMemo, useEffect, useState };
