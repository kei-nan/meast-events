import { useCallback, useEffect, useRef } from "react";
import { entryBeforePush, parseUrl, stateUrl, urlWriteMode } from "../lib/urlState";

const REPLACE_DEBOUNCE_MS = 400;

// The current entry's URL as stateUrl writes it: path and query (an open event
// is the path, /event/<id>; lib/urlState.js).
const currentUrl = () => (typeof window === "undefined" ? "/" : `${window.location.pathname}${window.location.search}`);

// This page load, in the history.state of each entry it pushes ({doc, back}):
// `back` (the entry pushed from) is only gone back to within the same load. An
// entry from before a reload belongs to another document: going back to it
// would load the page again.
const DOC = Math.random().toString(36).slice(2);

// Mirrors app state into the URL with the History API.
//  - Selecting/deselecting an event PUSHES a history entry (Back walks
//    through selections) and writes immediately; closing it again in the app
//    goes BACK to the entry it was opened from, so Back does not re-open it.
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
// state: {q, categories, countries, startYear, endYear, scope, area, eventId, about, sort}
export default function useUrlState(state, onNavigate) {
  const url = stateUrl(state);
  const lastRef = useRef(currentUrl());
  const replaceNextRef = useRef(false);
  const goingBackRef = useRef(false); // a history.back() of ours, awaiting its popstate
  const navigateRef = useRef(onNavigate);
  useEffect(() => {
    navigateRef.current = onNavigate;
  }, [onNavigate]);

  // The latest state, for the write below (updated first: effects run in order).
  const stateRef = useRef(state);
  useEffect(() => {
    stateRef.current = state;
  });

  // Writes `next` over the current entry (urlWriteMode); returns the pending
  // debounced write's cancel, if any. Shared by the effect below and by the
  // popstate of our own history.back().
  const sync = (next) => {
    const entry = window.history.state;
    const backUrl = entry?.doc === DOC ? entry.back : null;
    const mode = urlWriteMode(lastRef.current, next, { replace: replaceNextRef.current, backUrl });
    if (!mode) return undefined;
    // A replace keeps the entry's own history.state (its `back`).
    const write = (method, to = next) => {
      const data = method === "pushState" ? { doc: DOC, back: lastRef.current } : window.history.state;
      window.history[method](data, "", `${to}${window.location.hash}`);
      lastRef.current = to;
    };
    if (mode === "back") {
      // The popstate it fires is ours: that entry then gets the view as it is
      // by then (years or filters changed while the event was open are kept).
      replaceNextRef.current = false;
      goingBackRef.current = true;
      lastRef.current = next;
      window.history.back();
      return undefined;
    }
    if (mode !== "debounce") {
      replaceNextRef.current = false;
      if (mode === "push") {
        // A debounced replace still pending was cancelled by this change: the
        // current entry gets it first (lib/urlState.js entryBeforePush).
        const carried = entryBeforePush(lastRef.current, stateRef.current);
        if (carried != null) write("replaceState", carried);
      }
      write(mode === "push" ? "pushState" : "replaceState");
      return undefined;
    }
    const timer = setTimeout(() => write("replaceState"), REPLACE_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  };
  const syncRef = useRef(sync);
  useEffect(() => {
    syncRef.current = sync;
  });

  useEffect(() => {
    // history.back() is asynchronous: until its popstate arrives, the current
    // entry is still the one being left, so a write now (a push or replace)
    // would land on the wrong entry or race the traversal. The popstate
    // handler writes the latest state instead.
    if (goingBackRef.current) return undefined;
    return syncRef.current(url);
  }, [url]);

  useEffect(() => {
    const onPop = () => {
      if (goingBackRef.current) {
        // Our own history.back(): the entry reached gets the view as it is now,
        // at once. If the state moved on meanwhile (another event opened or
        // closed), that change is written from here like any other.
        goingBackRef.current = false;
        lastRef.current = currentUrl();
        const next = stateUrl(stateRef.current);
        if (urlWriteMode(lastRef.current, next) === "debounce") {
          window.history.replaceState(window.history.state, "", `${next}${window.location.hash}`);
          lastRef.current = next;
        } else {
          syncRef.current(next);
        }
        replaceNextRef.current = false;
        return;
      }
      replaceNextRef.current = false;
      lastRef.current = currentUrl();
      navigateRef.current(parseUrl(lastRef.current));
    };
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);

  return useCallback(() => {
    replaceNextRef.current = true;
  }, []);
}
