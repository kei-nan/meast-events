import { useEffect, useRef, useState } from "react";
import { loadSelectionFunnel } from "../lib/dataClient";
import "./AboutData.css";

const REPO = "https://github.com/kei-nan/atlas-wiki";

const fmt = (v) => (typeof v === "number" ? v.toLocaleString("en-US") : String(v));
const label = (k) => k.replace(/_/g, " ");
const isPlain = (v) => v === null || ["string", "number", "boolean"].includes(typeof v);

// Renders whatever selection-funnel.json contains, without assuming a schema:
// an array of {label|step|reason|name, count|n|value} becomes a bar list, any
// other array of objects a table, an object of scalars a two-column table.
// Every number shown comes from the file; nothing is computed or invented here.
function pickLabel(row) {
  for (const k of ["label", "step", "stage", "reason", "name", "country", "category", "id"]) {
    if (typeof row[k] === "string") return [k, row[k]];
  }
  return [null, null];
}
function pickCount(row) {
  for (const k of ["count", "n", "value", "events", "total"]) {
    if (typeof row[k] === "number") return [k, row[k]];
  }
  return [null, null];
}

function BarList({ rows }) {
  const max = Math.max(...rows.map((r) => r.count), 1);
  return (
    <ol className="about-bars">
      {rows.map((r, i) => (
        <li key={i}>
          <span className="about-bar-label">{r.label}</span>
          <span className="about-bar-track" aria-hidden="true">
            <span className="about-bar-fill" style={{ width: `${(r.count / max) * 100}%` }} />
          </span>
          <span className="about-bar-count">{fmt(r.count)}</span>
        </li>
      ))}
    </ol>
  );
}

function Section({ name, value }) {
  const title = label(name);
  if (Array.isArray(value) && value.length && value.every((r) => r && typeof r === "object" && !Array.isArray(r))) {
    const bars = value.map((r) => ({ label: pickLabel(r)[1], count: pickCount(r)[1] }));
    if (bars.every((b) => b.label !== null && b.count !== null)) {
      return (
        <section>
          <h4>{title}</h4>
          <BarList rows={bars} />
        </section>
      );
    }
    const cols = [...new Set(value.flatMap((r) => Object.keys(r)))].filter((c) => value.every((r) => isPlain(r[c] ?? null)));
    return (
      <section>
        <h4>{title}</h4>
        <div className="about-scroll" tabIndex={0} role="region" aria-label={title}>
          <table className="about-table">
            <thead>
              <tr>{cols.map((c) => <th key={c} scope="col">{label(c)}</th>)}</tr>
            </thead>
            <tbody>
              {value.map((r, i) => (
                <tr key={i}>{cols.map((c) => <td key={c}>{r[c] == null ? "" : fmt(r[c])}</td>)}</tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    );
  }
  if (value && typeof value === "object" && !Array.isArray(value)) {
    const entries = Object.entries(value);
    if (entries.length && entries.every(([, v]) => isPlain(v))) {
      const numeric = entries.every(([, v]) => typeof v === "number");
      if (numeric) return (
        <section>
          <h4>{title}</h4>
          <BarList rows={entries.map(([k, v]) => ({ label: k, count: v }))} />
        </section>
      );
      return (
        <section>
          <h4>{title}</h4>
          <dl className="about-dl">
            {entries.map(([k, v]) => (
              <div key={k}><dt>{label(k)}</dt><dd>{fmt(v)}</dd></div>
            ))}
          </dl>
        </section>
      );
    }
    return (
      <section>
        <h4>{title}</h4>
        {entries.map(([k, v]) => <Section key={k} name={k} value={v} />)}
      </section>
    );
  }
  if (Array.isArray(value) && value.every(isPlain)) {
    return (
      <section>
        <h4>{title}</h4>
        <ul>{value.map((v, i) => <li key={i}>{fmt(v)}</li>)}</ul>
      </section>
    );
  }
  return null;
}

function Funnel({ state }) {
  if (state.status === "loading") return <p role="status">Loading the selection funnel…</p>;
  if (state.status === "error") {
    return (
      <p className="about-unavailable" role="status">
        Funnel unavailable: the published selection-funnel file could not be loaded.
      </p>
    );
  }
  const data = state.data;
  const scalars = Object.entries(data).filter(([, v]) => isPlain(v));
  const rest = Object.entries(data).filter(([, v]) => !isPlain(v));
  return (
    <>
      {scalars.length > 0 && (
        <dl className="about-dl">
          {scalars.map(([k, v]) => (
            <div key={k}><dt>{label(k)}</dt><dd>{fmt(v)}</dd></div>
          ))}
        </dl>
      )}
      {rest.map(([k, v]) => <Section key={k} name={k} value={v} />)}
    </>
  );
}

/** "About the data" modal (native <dialog>: focus trap, Esc, focus restore). */
export default function AboutData({ onClose }) {
  const ref = useRef(null);
  const [funnel, setFunnel] = useState({ status: "loading", data: null });

  useEffect(() => {
    const d = ref.current;
    // No close() in cleanup: it would fire onClose (and un-open the page) when
    // StrictMode re-runs this effect. Unmounting removes the dialog anyway.
    if (d && !d.open) {
      d.showModal();
      d.querySelector("button")?.focus(); // start on Close, not the dialog element itself
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    loadSelectionFunnel()
      .then((data) => {
        if (!cancelled) setFunnel({ status: "ready", data });
      })
      .catch(() => {
        if (!cancelled) setFunnel({ status: "error", data: null });
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <dialog
      ref={ref}
      className="about-dialog"
      aria-labelledby="about-title"
      onClose={onClose}
      onClick={(e) => {
        if (e.target === ref.current) ref.current.close(); // backdrop click
      }}
    >
      <div className="about-inner">
        <div className="about-head">
          <h2 id="about-title">About the data</h2>
          <button type="button" className="sp-btn" aria-label="Close About the data" onClick={() => ref.current?.close()}>
            Close
          </button>
        </div>

        <h3>What is on the map</h3>
        <p>
          atlas.wiki shows Wikipedia and Wikidata content as it is. Titles, dates, countries and article text are
          copied, not rewritten; automated checks may only add a visible note, never change or remove content.
        </p>
        <p>An event is included when all of the following hold:</p>
        <ul>
          <li>Wikidata classes it as one of a fixed list of event types (battle, siege, referendum and so on).</li>
          <li>It is located in one of the tracked countries or territories.</li>
          <li>It has a date from 1900 onward.</li>
          <li>Its Wikidata item has at least 10 links to Wikimedia sites (Wikipedia language editions and sister projects such as Wikisource or Commons), and English Wikipedia has an article.</li>
        </ul>
        <p>
          Events without coordinates are still listed and searchable, tagged “No map location”; they get no map
          marker and are left out of drawn-area searches. Events pinned at a country capital because no specific site is
          known are marked “Approximate location”. A hand-picked seed list of events is also included; that part is
          our own choice.
        </p>

        <h3>Known biases</h3>
        <p>
          The rule is published and applied mechanically, but that does not make it neutral. Each filter favours
          some kinds of events over others:
        </p>
        <ul>
          <li>
            <strong>Language-edition counts favour European-language coverage.</strong> The 10-link threshold
            counts how many Wikipedia communities wrote about an event, not how important it is. Events with
            many translations pass; events covered mainly in regional languages (for example Arabic, Hebrew,
            Turkish or Persian) can fall below the threshold.
          </li>
          <li>
            <strong>The coordinates rule affects some event types more than others.</strong> Point-like events such as
            battles and attacks are easy to place; wars, treaties, referendums and other diffuse events often lack
            a location in Wikidata and so appear without a map marker.
          </li>
          <li>
            <strong>English article required.</strong> Events documented only in other language editions are not
            included, and the share missing differs by country.
          </li>
          <li>
            <strong>Our own choices.</strong> The list of Wikidata event classes, the set of tracked countries, the
            coarse “category (our grouping)” used for colours and filters, and the hand-picked seed list are
            decisions made by this project, not by Wikipedia.
          </li>
          <li>
            <strong>Wikidata is modelled unevenly.</strong> Only events someone has classified, dated and located
            in Wikidata can be found at all.
          </li>
        </ul>
        <p>
          A missing event says nothing about whether it happened. The full analysis is in the{" "}
          <a href={`${REPO}/blob/main/docs/bias-review/dataset-coverage.md`} target="_blank" rel="noreferrer" title="Opens in a new tab">
            dataset coverage review
          </a>
          .
        </p>

        <h3>Selection funnel</h3>
        <p className="about-muted">
          How candidates narrow down to what is shown, generated by the data pipeline (numbers below come straight
          from that file).
        </p>
        <Funnel state={funnel} />

        <h3>Report a problem</h3>
        <p>
          Wrong date, missing event, or a mistake in a text? Please{" "}
          <a href={`${REPO}/issues`} target="_blank" rel="noreferrer" title="Opens in a new tab">open an issue</a>. Errors in article text
          are best fixed on Wikipedia or Wikidata itself; the next data refresh picks the fix up.
        </p>

        <h3>Licensing</h3>
        <p>
          Source code: AGPL-3.0. Event text from Wikipedia: CC BY-SA 4.0, credited to Wikipedia contributors, with a
          link to each article. Wikidata: CC0. Borders adapted from CShapes 2.0 (CC BY-NC-SA 4.0), so the data is for
          non-commercial use. Details:{" "}
          <a href={`${REPO}/blob/main/docs/DATA_POLICY.md`} target="_blank" rel="noreferrer" title="Opens in a new tab">data policy</a>,{" "}
          <a href={`${REPO}/blob/main/NOTICE`} target="_blank" rel="noreferrer" title="Opens in a new tab">NOTICE</a>,{" "}
          <a href={`${REPO}/blob/main/data/LICENSE`} target="_blank" rel="noreferrer" title="Opens in a new tab">data license</a>.
        </p>
      </div>
    </dialog>
  );
}
