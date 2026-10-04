import { useCallback, useEffect, useRef } from "react";
import { parseUrlState, serializeUrlState, urlWriteMode } from "../lib/urlState";

const REPLACE_DEBOUNCE_MS = 400;

// Mirrors app state into the URL with the History API.
//  - Selecting/deselecting an event PUSHES a history entry (Back walks
//    through selections) and writes immediately.
//  - Every other change (text, filters, years, scope, area) REPLACES the
//    current entry, debounced so typing doesn't spam history.
//  - popstate re-reads the URL (strictly validated) and hands the parsed
//    state to `onNavigate`; the write-back that follows is suppressed.
// See urlWriteMode (lib/urlState.js).
//
// Returns replaceNext(): call it just before an event change that should
// overwrite the current entry instead of pushing one (clearing a link to an
// unknown event, so Back does not return to the dead URL).
//
// state: {q, categories, countries, startYear, endYear, scope, area, eventId}
export default function useUrlState(state, onNavigate) {
  const serialized = serializeUrlState(state);
  const lastRef = useRef(typeof window === "undefined" ? "" : window.location.search);
  const replaceNextRef = useRef(false);
  const navigateRef = useRef(onNavigate);
  useEffect(() => {
    navigateRef.current = onNavigate;
  }, [onNavigate]);

  useEffect(() => {
    const mode = urlWriteMode(lastRef.current, serialized, { replace: replaceNextRef.current });
    if (!mode) return;
    const write = (method) => {
      const url = `${window.location.pathname}${serialized}${window.location.hash}`;
      window.history[method](null, "", url);
      lastRef.current = serialized;
    };
    if (mode !== "debounce") {
      replaceNextRef.current = false;
      write(mode === "push" ? "pushState" : "replaceState");
      return;
    }
    const timer = setTimeout(() => write("replaceState"), REPLACE_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [serialized]);

  useEffect(() => {
    const onPop = () => {
      lastRef.current = window.location.search;
      replaceNextRef.current = false;
      navigateRef.current(parseUrlState(window.location.search));
    };
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);

  return useCallback(() => {
    replaceNextRef.current = true;
  }, []);
}
