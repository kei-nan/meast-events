import { useEffect, useRef } from "react";

// Stand-ins for lazy-loaded parts whose code could not be downloaded
// (lib/importOr.js). Styled in index.css: the part's own stylesheet is
// in the chunk that failed.

/** In place of the framing review under an event's text. */
export function FramingReviewFailed() {
  return (
    <p className="load-failed" role="alert">
      The framing review could not be loaded. Please reload the page.
    </p>
  );
}

/** In place of the About the data dialog: says so, and closes like it (Close, Esc, a backdrop click). */
export function AboutDataFailed({ onClose }) {
  const ref = useRef(null);
  useEffect(() => {
    const d = ref.current;
    if (d && !d.open) d.showModal();
  }, []);
  return (
    <dialog
      ref={ref}
      className="load-failed-dialog"
      aria-labelledby="load-failed-title"
      onClose={onClose}
      onClick={(e) => {
        if (e.target === ref.current) ref.current.close(); // backdrop click
      }}
    >
      <h2 id="load-failed-title">About the data</h2>
      <p className="load-failed" role="alert">
        This could not be loaded. Please reload the page.
      </p>
      <button type="button" onClick={() => ref.current?.close()}>
        Close
      </button>
    </dialog>
  );
}
