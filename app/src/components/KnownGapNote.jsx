// "Not in this atlas", above the results: a search whose words name a well-known event the
// inclusion rule does not reach (the data policy's "Known gaps" table, lib/knownGaps.js)
// says why it is missing, in the policy's own words, with links to the event's Wikidata
// item (the reasons are read from it) and to the section. Shown with or without other
// results: "Taif" finds no event, "coup" finds coups and also names the two the rule misses.
//
// The table is its own small file (src/data/known-gaps.json, written by
// scripts/split-data.mjs), loaded with the first search. If it cannot be loaded, there is
// no note: the results are not affected.

import { Fragment, useEffect, useState } from "react";
import { knownGapsUrl, matchKnownGaps } from "../lib/knownGaps.js";
import { wikidataUrl } from "../lib/partOf.js";

let loading = null;
const loadGaps = () =>
  (loading ??= import("../data/known-gaps.json").then(
    (m) => m.default,
    () => {
      loading = null; // tried again with the next search
      return null;
    }
  ));

function Parts({ parts }) {
  return parts.map((p, i) =>
    p.code !== undefined ? (
      <code key={i}>{p.code}</code>
    ) : p.strong !== undefined ? (
      <strong key={i}>{p.strong}</strong>
    ) : p.link !== undefined ? (
      <a key={i} href={p.url} target="_blank" rel="noreferrer">
        {p.link}
        <span className="sp-sr-status"> (opens in a new tab)</span>
      </a>
    ) : (
      <Fragment key={i}>{p.text}</Fragment>
    )
  );
}

export default function KnownGapNote({ query }) {
  const [gaps, setGaps] = useState(null);
  const wanted = Boolean(query?.trim());
  useEffect(() => {
    if (!wanted || gaps) return;
    let live = true;
    loadGaps().then((g) => live && g && setGaps(g));
    return () => {
      live = false;
    };
  }, [wanted, gaps]);

  const matches = wanted && gaps ? matchKnownGaps(query, gaps.entries) : [];
  if (!matches.length) return null;
  const sectionUrl = knownGapsUrl(gaps.anchor);
  return (
    <div className="sp-gap-note" role="note">
      {matches.map((e) => {
        const wd = wikidataUrl(e.qid);
        return (
          <p key={e.qid}>
            <span className="sp-gap-note-name">Not in this atlas: {e.name}</span>
            {wd && (
              <>
                {" "}
                <a href={wd} target="_blank" rel="noreferrer">
                  Wikidata<span aria-hidden="true"> ↗</span>
                  <span className="sp-sr-status"> item for {e.name} (opens in a new tab)</span>
                </a>
              </>
            )}
            <br />
            Why the rule misses it: <Parts parts={e.reason} />
          </p>
        );
      })}
      <p className="sp-gap-note-intro">
        From the data policy&apos;s{" "}
        <a href={sectionUrl} target="_blank" rel="noreferrer">
          known gaps
          <span className="sp-sr-status"> (opens in a new tab)</span>
        </a>
        : &ldquo;<Parts parts={gaps.intro} />&rdquo;
      </p>
    </div>
  );
}
