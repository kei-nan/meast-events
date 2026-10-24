import { useEffect, useRef, useState } from "react";
import { citationNotes, citeEvent } from "../lib/citation.js";
import "./Citation.css";

// One citation as shown: italics where the style puts them; the copied text is plain (lib/citation.js).
function CitationText({ parts }) {
  return parts.map((p, i) => (p.italic ? <i key={i}>{p.text}</i> : <span key={i}>{p.text}</span>));
}

async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    window.prompt("Copy this citation", text);
    return false;
  }
}

/**
 * The event's citations (APA 7, MLA 9, Chicago), the note on which version the link is, this site's
 * event page and the border data's credit. `copy` adds a "Copy" button to each citation.
 * `headingLevel` is the level of each style's heading.
 */
export function CitationList({ cite, copy = false, headingLevel = 3 }) {
  const [copied, setCopied] = useState(null);
  useEffect(() => {
    if (!copied) return undefined;
    const t = setTimeout(() => setCopied(null), 2500);
    return () => clearTimeout(t);
  }, [copied]);
  const H = `h${headingLevel}`;
  const [versionNote, chicagoNote] = citationNotes(cite);
  return (
    <div className="cite-list">
      <p className={cite.revid ? "cite-version" : "cite-version cite-version--live"}>{versionNote}</p>
      {cite.styles.map((s) => (
        <div className="cite-style" key={s.id}>
          <H className="cite-style-name">{s.label}</H>
          <p className="cite-text">
            <CitationText parts={s.parts} />
          </p>
          {copy && (
            <button
              type="button"
              className="sp-btn cite-copy"
              aria-label={`Copy the ${s.label} citation`}
              onClick={async () => {
                if (await copyText(s.text)) setCopied(s.id);
              }}
            >
              {copied === s.id ? "Copied" : "Copy"}
            </button>
          )}
        </div>
      ))}
      <p className="cite-note">{chicagoNote}</p>
      <p className="cite-note">
        This event on {cite.siteName}: <span className="cite-url">{cite.eventPage}</span>
      </p>
      <p className="cite-note">If you use the map&apos;s borders: {cite.borders}</p>
      {copy && (
        <span className="sp-sr-status" role="status">
          {copied ? `${cite.styles.find((s) => s.id === copied)?.label} citation copied` : ""}
        </span>
      )}
    </div>
  );
}

/**
 * "Cite" from the Share menu: a modal (native <dialog>: focus trap, focus on Close) with the citations
 * and copy buttons. Escape closes only this dialog (not the event behind it). `onClose` runs once it is closed.
 */
export function CiteDialog({ event, onClose }) {
  const ref = useRef(null);
  const cite = citeEvent(event);
  useEffect(() => {
    const d = ref.current;
    // No close() in cleanup (StrictMode re-runs effects; unmounting removes the dialog anyway).
    if (d && !d.open) {
      d.showModal();
      d.querySelector("button")?.focus();
    }
  }, []);
  return (
    <dialog
      ref={ref}
      className="cite-dialog"
      aria-labelledby="cite-dialog-title"
      onClose={onClose}
      onKeyDown={(e) => {
        if (e.key !== "Escape") return;
        // Handled here: the event panel's own Escape (Back) must not also run.
        e.preventDefault();
        e.stopPropagation();
        ref.current?.close();
      }}
      onClick={(e) => {
        if (e.target === ref.current) ref.current.close(); // backdrop click
      }}
    >
      <div className="cite-inner">
        <div className="cite-head">
          <h2 id="cite-dialog-title">Cite this</h2>
          <button type="button" className="sp-btn" aria-label="Close Cite this" onClick={() => ref.current?.close()}>
            Close
          </button>
        </div>
        {cite ? (
          <>
            <p className="cite-intro">
              The text is Wikipedia&apos;s, so these cite the Wikipedia article &ldquo;{cite.title}&rdquo;.
            </p>
            <CitationList cite={cite} copy headingLevel={3} />
          </>
        ) : (
          <p className="cite-intro">This event has no English Wikipedia article to cite.</p>
        )}
      </div>
    </dialog>
  );
}

/** The citations for print only (@media print shows it; hidden on screen). */
export function CitationPrint({ event }) {
  const cite = event.leadStatus ? null : citeEvent(event);
  if (!cite) return null;
  return (
    <section className="cite-print">
      <h3>Cite this</h3>
      <CitationList cite={cite} headingLevel={4} />
    </section>
  );
}
