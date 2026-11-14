import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

// Stylesheet rules the phone layout and touch screens rely on. Read as text: the
// browser checks are in the PR that added them (computed name, contrast, sizes).
const css = (f) => readFileSync(new URL(`../${f}`, import.meta.url), "utf8");
// The declarations of the rule whose selector list is exactly `selector`, inside `text`.
function rule(text, selector) {
  const esc = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/\s+/g, "\\s+");
  const m = text.match(new RegExp(`(?:^|[}\\n])\\s*${esc}\\s*\\{([^}]*)\\}`));
  return m ? m[1] : null;
}
const media = (text, query) => {
  const start = text.indexOf(`@media ${query} {`);
  assert.ok(start >= 0, `no @media ${query}`);
  // The block: up to the next top-level @media.
  const next = text.indexOf("\n@media", start + 1);
  return text.slice(start, next < 0 ? undefined : next);
};

test("the lowered sheet's search label is hidden from sight only, so the search box keeps its name", () => {
  const r = rule(media(css("SidePanel.css"), "(max-width: 768px)"), '.side-panel[data-sheet="peek"] .sp-label');
  assert.ok(r, "no peek rule for .sp-label");
  assert.doesNotMatch(r, /display:\s*none|visibility:\s*hidden/);
  assert.match(r, /position:\s*absolute/);
  assert.match(r, /clip-path:\s*inset\(50%\)/);
});

test("the selected related-events tab draws its count in a colour with 4.5:1 on its tint", () => {
  const r = rule(css("SidePanel.css"), '.rel-tab[aria-selected="true"] .rel-tab-count');
  assert.ok(r, "no rule for the selected tab's count");
  assert.match(r, /color:\s*var\(--text-(secondary|primary)\)/);
});

test("'Read the review' gets the same touch hit area as 'Reviewed by AI', padding that does not reach over the next line's links", () => {
  const sp = css("SidePanel.css");
  const r = rule(sp, ".fr-ai-btn,\n  .framing-pointer-link");
  assert.ok(r, "no touch hit area for the two buttons");
  assert.match(r, /padding-block:\s*5px/);
  assert.match(r, /margin-block:\s*-5px/, "the line keeps its height");
  // An ::after area 12px past the button covered "Disagree with this review?" on the line under it.
  assert.doesNotMatch(sp, /\.fr-ai-btn::after/);
  // Positioned, it was drawn (and tapped) over that line's link where the two meet.
  assert.doesNotMatch(rule(sp, ".fr-ai-btn"), /position:/);
  assert.doesNotMatch(rule(sp, ".framing-pointer-link"), /position:/);
});

test("short-screen queries are in em, so a raised text size makes a screen short too", () => {
  for (const f of ["App.css", "SidePanel.css", "Timeline.css", "components/MapUi.css", "components/MapNav.css"]) {
    assert.doesNotMatch(css(f), /@media[^{]*max-height:\s*\d+px/, `${f}: a max-height query in px`);
  }
  assert.match(css("SidePanel.css"), /@media \(max-height: 31\.25em\) \{\s*\.app:has\(\.side-panel:not\(\[data-sheet="peek"\]\)\)/);
});

test("on phones the title and the timeline's controls can wrap with large text", () => {
  // The title's grid column may shrink below its words (minmax(0, 1fr)), so it wraps.
  const phone = media(css("App.css"), "(max-width: 768px)");
  assert.match(rule(phone, ".app-header"), /grid-template-columns:\s*minmax\(0, 1fr\) auto/);
  const h1 = rule(phone, ".app-header h1");
  assert.match(h1, /min-width:\s*0/);
  const controls = rule(media(css("Timeline.css"), "(max-width: 768px)"), ".timeline-controls");
  assert.match(controls, /flex-wrap:\s*wrap/);
  assert.match(controls, /flex-shrink:\s*1/);
});
