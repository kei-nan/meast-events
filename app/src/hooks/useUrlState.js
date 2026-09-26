import { useEffect, useRef } from "react";
import { parseUrlState, serializeUrlState } from "../lib/urlState";

const REPLACE_DEBOUNCE_MS = 400;

// Mirrors app state into the URL with the History API.
//  - Selecting/deselecting an event PUSHES a history entry (Back walks
//    through selections) and writes immediately.
//  - Every other change (text, filters, years, scope, area) REPLACES the
//    current entry, debounced so typing doesn't spam history.
//  - popstate re-reads the URL (strictly validated) and hands the parsed
//    state to `onNavigate`; the write-back that follows is suppressed.
//
// state: {q, categories, countries, startYear, endYear, scope, area, eventId}
export default function useUrlState(state, onNavigate) {
  const serialized = serializeUrlState(state);
  const { eventId } = state;
  const lastRef = useRef(typeof window === "undefined" ? "" : window.location.search);
  const navigateRef = useRef(onNavigate);
  useEffect(() => {
    navigateRef.current = onNavigate;
  }, [onNavigate]);

  useEffect(() => {
    if (serialized === lastRef.current) return;
    const eventChanged = parseUrlState(lastRef.current).eventId !== eventId;
    const write = () => {
      const url = `${window.location.pathname}${serialized}${window.location.hash}`;
      window.history[eventChanged ? "pushState" : "replaceState"](null, "", url);
      lastRef.current = serialized;
    };
    if (eventChanged) {
      write();
      return;
    }
    const timer = setTimeout(write, REPLACE_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [serialized, eventId]);

  useEffect(() => {
    const onPop = () => {
      lastRef.current = window.location.search;
      navigateRef.current(parseUrlState(window.location.search));
    };
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);
}
