import { useId, useRef, useState } from "react";
import { loadExportResults } from "../lib/lazyChunks.js";
import { timelineAxis, timelineOrder } from "../lib/timelineView.js";
import { MAX_YEAR, MIN_YEAR } from "../lib/years.js";

/**
 * The search panel's Download (components/ResultsDownload.jsx draws it): the list
 * as the panel shows it, as CSV or JSON. The same results, in the order
 * ResultsList lists them (the Timeline view: timelineOrder, as there), every row,
 * not only the ones "Show more" has revealed. Built from the lite records in
 * memory (lib/exportResults.js says what that leaves out). Its code is a chunk of
 * its own: opening the menu starts it, a choice waits for it.
 */
export default function useResultsDownload({ results, loading, eventsLoading, eventsError, range, searching, filters, view, textQuery, area, sort }) {
  const [open, setOpen] = useState(false);
  const menuId = useId();
  const buttonRef = useRef(null);
  const [failed, setFailed] = useState(false);
  const show = !eventsLoading && !eventsError;
  const can = show && !loading && results.length > 0;
  const label = `Download ${results.length === 1 ? "this result" : `these ${results.length} results`}`;

  async function download(kind) {
    if (!can) return;
    let lib;
    try {
      lib = await loadExportResults();
    } catch {
      setFailed(true);
      return;
    }
    setFailed(false);
    const { downloadText, exportFileRange, exportFilename, exportQuery, exportRows, toCSV, toJSON } = lib;
    // The Timeline's axis as ResultsList draws it (SearchPanel's fitAxis), for where a reversed record is placed.
    const axis = timelineAxis(results, range, { fit: searching && filters.scope !== "range", minYear: MIN_YEAR, maxYear: MAX_YEAR });
    const ordered = view === "timeline" ? timelineOrder(results, searching ? null : range[0], axis) : results;
    const rows = exportRows(ordered, { range, browse: !searching });
    const name = exportFilename(exportFileRange(range, { searching, scope: filters.scope }), rows.length, kind);
    if (kind === "csv") downloadText(toCSV(rows), name, "text/csv;charset=utf-8");
    else {
      const q = exportQuery({ query: textQuery, filters, area, range, sort, view });
      downloadText(toJSON(rows, { query: q }), name, "application/json;charset=utf-8");
    }
  }

  return { show, can, label, open, setOpen, menuId, buttonRef, failed, download };
}
