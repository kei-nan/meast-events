import test from "node:test";
import assert from "node:assert/strict";
import { candidateRuns, decodeEntities, htmlLead, htmlLeadToText } from "./rev-lead.js";

const wrap = (inner) => `<div class="mw-content-ltr mw-parser-output" lang="en" dir="ltr">${inner}</div>`;

test("htmlLead: unwraps mw-parser-output, keeps only the lead, removes what TextExtracts removes", () => {
  const html = wrap(
    '<div class="shortdescription nomobile noexcerpt noprint searchaux" style="display:none">Short</div>\n' +
      "<style>.x{}</style><table class=\"infobox\"><tr><td>Box <table><tr><td>inner</td></tr></table></td></tr></table>\n" +
      '<p>The <b>Battle</b> of X<sup id="cite_ref-1" class="reference"><a href="#cite_note-1">[1]</a></sup> was fought&#160;in 1916 &amp; 1917.\n</p>' +
      '<p><span class="noprint">[edit]</span>Second <a href="/wiki/Y" title="Y">paragraph</a>.<br />Line two.\n</p>' +
      '<!-- comment --><div class="mw-heading mw-heading2"><h2 id="Background">Background</h2></div><p>Not the lead.</p>'
  );
  assert.equal(htmlLead(html), "The Battle of X was fought in 1916 & 1917.\n\nSecond paragraph.Line two.");
});

test("htmlLeadToText: nested removed elements of the same tag are skipped as a whole", () => {
  assert.equal(htmlLeadToText("<p>a<div>b<div>c</div>d</div>e</p>"), "<p>ae</p>".replace(/<\/?p>/g, ""));
  assert.equal(htmlLeadToText('<p>a<span class="sortkey">k<span>s</span>k</span>b</p>'), "ab");
  assert.equal(htmlLeadToText('<p>a<img src="x.png" alt="pic">b</p>'), "ab");
});

test("decodeEntities: numeric and common named entities; an unknown one fails instead of guessing", () => {
  assert.equal(decodeEntities("&#8211; &#x2014; &amp; &lt;&gt; &quot;&#39; &nbsp;"), "– — & <> \"' \u00a0");
  assert.equal(decodeEntities("&hellip;"), null);
  assert.equal(htmlLeadToText("<p>a &frac12; b</p>"), null);
  assert.equal(decodeEntities("AT&T and & alone"), "AT&T and & alone");
});

const R = (revid, timestamp, wikitext) => ({ revid, timestamp, wikitext });

test("candidateRuns: the run current at the anchor first (citing the anchor), then older and newer alternately", () => {
  const revs = [
    R(9, "2026-10-20T00:00:00Z", "C"),
    R(8, "2026-10-15T00:00:00Z", "B"),
    R(7, "2026-10-09T00:00:00Z", "B"),
    R(6, "2026-10-05T00:00:00Z", "B"),
    R(5, "2026-10-01T00:00:00Z", "A"),
    R(4, "2026-09-20T00:00:00Z", "A"),
  ];
  const c = candidateRuns(revs, "2026-10-10T23:59:59Z");
  assert.deepEqual(
    c.map((x) => [x.wikitext, x.revid, x.revids]),
    [
      ["B", 7, [8, 7, 6]],
      ["A", 5, [5, 4]], // older run: its newest revision
      ["C", 9, [9]], // newer run: its oldest revision
    ]
  );
});

test("candidateRuns: hidden wikitext (null) never groups and is never a candidate; anchor before all revisions", () => {
  const revs = [R(3, "2026-10-03T00:00:00Z", "A"), R(2, "2026-10-02T00:00:00Z", null), R(1, "2026-10-01T00:00:00Z", "A")];
  assert.deepEqual(
    candidateRuns(revs, "2026-10-02T12:00:00Z").map((x) => x.revid),
    [1, 3]
  );
  assert.deepEqual(
    candidateRuns(revs, "2026-09-01T00:00:00Z").map((x) => x.revid),
    [1, 3]
  );
});
