// Test-only "react" for component render tests (aliased in for "react" by
// viteNodeHooks.mjs, `data.aliases`): React itself, except that while
// fakeReact's renderHook() is rendering, the state, ref, memo and effect hooks
// are fakeReact's. That lets a test render a component to markup with
// react-dom/server (which never runs effects or re-renders), then run its
// effects, let their promises settle and render again, as the browser would:
//
//   const view = renderHook(() => renderToStaticMarkup(<AboutData />));
//   await settle();
//   const html = view.rerender();
//
// Outside renderHook every hook is React's own, so plain renderToStaticMarkup
// renders the first paint exactly as React does. Hook slots are kept by call
// order across the whole rendered tree, so this suits components whose hooks
// run in the same order on every render (see fakeReact.mjs for what is not modelled).
import * as Real from "../../../node_modules/react/index.js";
import * as Fake from "./fakeReact.mjs";

export * from "../../../node_modules/react/index.js";
export default Real.default;

const either = (fake, real) => (...args) => (Fake.rendering() ? fake : real)(...args);

export const useState = either(Fake.useState, Real.useState);
export const useRef = either(Fake.useRef, Real.useRef);
export const useMemo = either(Fake.useMemo, Real.useMemo);
export const useCallback = either(Fake.useCallback, Real.useCallback);
export const useEffect = either(Fake.useEffect, Real.useEffect);
export const useLayoutEffect = either(Fake.useEffect, Real.useLayoutEffect);
