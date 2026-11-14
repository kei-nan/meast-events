import { useCallback, useEffect, useMemo, useRef } from "react";
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

// Each entry this load writes over gets a key of its own in its history.state
// (`key`), so a replace that was still waiting when the browser left the entry
// (Back or Forward within the 400 ms) can be put on it when it is reached
// again: by the time popstate fires, the entry left can no longer be written.
let keyCount = 0;
const newKey = () => `${DOC}.${++keyCount}`;

// Mirrors app state into the URL with the History API.
//  - Selecting/deselecting an event PUSHES a history entry (Back walks
//    through selections) and writes immediately; closing it again in the app
//    goes BACK to the entry it was opened from, so Back does not re-open it.
//    So do About, "What was this place?" and a search started (the first
//    letter typed into an empty box; urlWriteMode).
//  - Every other change (the rest of the text, filters, years, scope, area,
//    the map's camera) REPLACES the current entry, debounced so typing (or
//    Play, or panning) doesn't spam history.
//  - popstate re-reads the URL (strictly validated) and hands the parsed
//    state to `onNavigate`; the write-back that follows is suppressed. A
//    replace still waiting when Back/Forward left its entry is put on that
//    entry when it is reached again (`key`, below).
// See urlWriteMode (lib/urlState.js).
//
// A pushed entry's history.state is {doc, back, key} plus what the entry it was
// pushed from had otherwise (the phone sheet's mark, hooks/useSheetDrag.js),
// so an event opened from the open sheet still counts as "sheet open".
//
// Returns {replaceNext, pushNext}. replaceNext(): call it just before an event
// change that should overwrite the current entry instead of pushing one
// (clearing a link to an unknown event, so Back does not return to the dead
// URL). pushNext(): call it just before a change of the years that should get
// an entry of its own (a timeline preset, so Back returns to the years before
// it); a render that does not change the URL drops the request.
//
// state: {q, categories, countries, startYear, endYear, scope, area, eventId, about, sort, view, place, mapView}
export default function useUrlState(state, onNavigate) {
  const url = stateUrl(state);
  const lastRef = useRef(currentUrl());
  const replaceNextRef = useRef(false);
  const pushNextRef = useRef(false);
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

  // The debounced replace still waiting ({timer, url, key}: the URL it would
  // write and the key of the entry it is for), and the replaces that never
  // landed because the browser left their entry first ({key: url}, put on the
  // entry when a traversal reaches it again).
  const pendingRef = useRef(null);
  const missedRef = useRef(new Map());
  // The pending replace is for an entry being left by a traversal: kept for it.
  const keepPending = () => {
    const pending = pendingRef.current;
    pendingRef.current = null;
    if (!pending) return;
    clearTimeout(pending.timer);
    missedRef.current.set(pending.key, pending.url);
  };

  // Writes `next` over the current entry (urlWriteMode); returns the pending
  // debounced write's cancel, if any. Shared by the effect below and by the
  // popstate of our own history.back().
  const sync = (next) => {
    const entry = window.history.state;
    const backUrl = entry?.doc === DOC ? entry.back : null;
    const push = pushNextRef.current;
    const mode = urlWriteMode(lastRef.current, next, { replace: replaceNextRef.current, backUrl, push });
    // A replace still waiting (its timer already cleared by the effect's
    // cleanup) is superseded by whatever this change writes, except a "back",
    // which leaves its entry: kept for it (keepPending).
    if (mode !== "back") pendingRef.current = null;
    if (!mode) return undefined;
    pushNextRef.current = false;
    // A replace keeps the entry's own history.state (its `back`, its `key`);
    // a push gets a key of its own.
    const write = (method, to = next) => {
      const data =
        method === "pushState"
          ? { ...window.history.state, doc: DOC, back: lastRef.current, key: newKey() }
          : window.history.state;
      window.history[method](data, "", `${to}${window.location.hash}`);
      lastRef.current = to;
    };
    if (mode === "back") {
      keepPending();
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
        const carried = entryBeforePush(lastRef.current, stateRef.current, { years: push });
        if (carried != null) write("replaceState", carried);
      }
      write(mode === "push" ? "pushState" : "replaceState");
      return undefined;
    }
    // The entry gets its key now if it has none yet (the first entry, or one
    // useSheetDrag pushed): one write per entry, the URL unchanged.
    let key = entry?.key;
    if (!key) {
      key = newKey();
      window.history.replaceState({ ...entry, key }, "", currentUrl() + window.location.hash);
    }
    const timer = setTimeout(() => {
      pendingRef.current = null;
      write("replaceState");
    }, REPLACE_DEBOUNCE_MS);
    pendingRef.current = { timer, url: next, key };
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
  // A pushNext() whose change left the URL as it was (a preset already
  // selected) must not make some later change a push: dropped after each render.
  useEffect(() => {
    pushNextRef.current = false;
  });

  useEffect(() => {
    const onPop = () => {
      // The entry left had a replace still waiting: it is too late to write
      // it there now (that would land on the entry reached), so it is kept
      // for when the entry is reached again. An entry reached that missed
      // one gets it now, and its view is the one re-applied below.
      keepPending();
      const key = window.history.state?.key;
      const missed = key != null ? missedRef.current.get(key) : undefined;
      if (missed != null) {
        missedRef.current.delete(key);
        window.history.replaceState(window.history.state, "", `${missed}${window.location.hash}`);
      }
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
      // An entry with the view as it already is (the phone sheet's own entry,
      // useSheetDrag): nothing to re-apply, so Play keeps playing.
      if (lastRef.current === stateUrl(stateRef.current)) return;
      navigateRef.current(parseUrl(lastRef.current));
    };
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);

  const replaceNext = useCallback(() => {
    replaceNextRef.current = true;
  }, []);
  const pushNext = useCallback(() => {
    pushNextRef.current = true;
  }, []);
  return useMemo(() => ({ replaceNext, pushNext }), [replaceNext, pushNext]);
}
