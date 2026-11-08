import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { loadFullLead } from "../lib/dataClient";

/**
 * The opened event with its full lead (App.jsx): the extract, its retrieval date
 * and the framing review, which the lite event list leaves out.
 *
 * Full leads are fetched lazily, only for the opened event (never for lists);
 * usually the request is already under way, started when its row or link was
 * pointed at, focused or pressed (lib/warmEvent.js), and loadFullLead shares it.
 * Until the lead arrives (or if it cannot be fetched) the event shows its
 * snippet, flagged `leadStatus: "loading" | "error"`.
 *
 * @param {object|null|undefined} selectedEventRaw  the lite record of the open event
 * @param {string|null} selectedEventId
 * @returns {{selectedEvent: object|null|undefined, retryLead: () => void}}
 */
export default function useEventLead(selectedEventRaw, selectedEventId) {
  // id -> {extract, extract_retrieved_at, framing_review} | "error"
  const [leads, setLeads] = useState({});
  const leadRequestedRef = useRef(new Set());
  // Bumped by the event view's "Try again" after a failure, which runs the effect below again.
  const [leadAttempt, setLeadAttempt] = useState(0);
  const retryLead = useCallback(() => setLeadAttempt((n) => n + 1), []);
  const needsLead =
    Boolean(selectedEventRaw) &&
    (selectedEventRaw.extract === undefined || selectedEventRaw.framing_review === undefined);
  useEffect(() => {
    if (!needsLead || leadRequestedRef.current.has(selectedEventId)) return;
    const id = selectedEventId;
    leadRequestedRef.current.add(id);
    // A retry ("Try again", or re-opening after a failure) shows "loading" again, not the old error.
    setLeads((m) => {
      if (!(id in m)) return m;
      const next = { ...m };
      delete next[id];
      return next;
    });
    const failed = () => {
      leadRequestedRef.current.delete(id); // allow a retry
      setLeads((m) => ({ ...m, [id]: "error" }));
    };
    loadFullLead(id)
      .then((lead) => (lead ? setLeads((m) => ({ ...m, [id]: lead })) : failed()))
      .catch(failed);
  }, [needsLead, selectedEventId, leadAttempt]);

  const selectedEvent = useMemo(() => {
    const raw = selectedEventRaw;
    if (!raw) return raw;
    const lead = leads[raw.id];
    const full = lead && lead !== "error" ? lead : null;
    if (full) return { ...raw, ...full };
    // Until the full lead arrives (or if it cannot be fetched) show the snippet, flagged as partial.
    return { ...raw, extract: raw.snippet ?? "", leadStatus: lead === "error" ? "error" : "loading" };
  }, [selectedEventRaw, leads]);

  return { selectedEvent, retryLead };
}
