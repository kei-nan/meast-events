import { loadExportResults } from "../lib/lazyChunks.js";

// The search panel's Download (SearchPanel.jsx; state and file building in
// hooks/useResultsDownload.js). The toggle sits at the end of the status line
// and its choices right under that line, so they are two components sharing the
// hook's result.

// At the line's end and always the same width ("Download"; the count is
// in its name), so nothing moves when the results change: disabled
// while there is nothing settled to save.
export function DownloadToggle({ d: { show, can, label, open, setOpen, menuId, buttonRef } }) {
  if (!show) return null;
  return (
    <button
      ref={buttonRef}
      type="button"
      className="sp-download-toggle"
      aria-expanded={open}
      aria-controls={menuId}
      aria-label={can ? label : "Download (no results to save)"}
      title={can ? `${label} as CSV or JSON` : undefined}
      disabled={!can}
      onClick={() => {
        if (!open) loadExportResults().catch(() => {}); // a choice reports a failure
        setOpen(!open);
      }}
      // Escape closes the choices from the button as well as from inside them (DownloadMenu).
      onKeyDown={(e) => {
        if (e.key !== "Escape" || e.defaultPrevented || !open) return;
        e.preventDefault();
        setOpen(false);
      }}
    >
      <span className="sp-caret" aria-hidden="true" />
      Download
    </button>
  );
}

// The download choices, right under their button.
export function DownloadMenu({ d: { show, can, label, open, setOpen, menuId, buttonRef, failed, download } }) {
  if (!show) return null;
  return (
    <div
      id={menuId}
      className="sp-download"
      role="group"
      aria-label={label}
      hidden={!open || !can}
      onKeyDown={(e) => {
        if (e.key !== "Escape") return;
        e.preventDefault();
        setOpen(false);
        buttonRef.current?.focus();
      }}
    >
      <p className="sp-download-what">{label}, in the order listed:</p>
      <div className="sp-download-btns">
        <button type="button" className="sp-btn" onClick={() => download("csv")}>
          CSV <span className="sp-download-hint">(spreadsheet)</span>
        </button>
        <button type="button" className="sp-btn" onClick={() => download("json")}>
          JSON
        </button>
      </div>
      <p className="sp-download-note">
        Titles are Wikipedia text (CC BY-SA 4.0, credited in the file). No summaries or borders
        are included; each row links its event page.
      </p>
      {failed && (
        <p className="load-failed" role="alert">
          The download could not be prepared. Please reload the page.
        </p>
      )}
    </div>
  );
}
