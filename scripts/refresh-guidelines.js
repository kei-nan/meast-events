// Checks whether the Wikipedia guideline sections cited by the framing review's wording check have changed
// since the reviews applied them (docs/framing-review.md, "Guideline versions"). Run monthly by
// .github/workflows/refresh-data.yml after the extract refresh.
//
//   node scripts/refresh-guidelines.js                  DRY RUN (default): prints each changed section as a diff, writes nothing
//   node scripts/refresh-guidelines.js --apply          records newly changed sections in data/framing-review.json
//   node scripts/refresh-guidelines.js --pin=YYYY-MM-DD records the revisions current at the end of that day (UTC) as the
//                                                       ones the reviews applied (after the wording check is redone)
//   node scripts/refresh-guidelines.js --report=path    also write the printout to a markdown file
//   node scripts/refresh-guidelines.js --max-lines=N    diff lines per section in the printout (default 8)
//
// Each guideline in data/framing-review.json keeps `reviewed_revision` ({revid, timestamp, section_sha1}): the
// revision the reviews applied and a fingerprint of that section's own text (lib/guidelines.js). Only the
// section's text counts; edits elsewhere on the page are ignored. When the section's text differs from the
// reviewed one, --apply stores the current revision as `changed_revision` and the printout shows the diff. A
// change already recorded is listed again in one line, without the diff, so each edit is shown in full once;
// a section edited back to the reviewed text loses its `changed_revision`. Nothing here re-reviews anything:
// whether a change matters for the reviews is the owner's call.
import { readFile, writeFile } from "node:fs/promises";
import { parseGuidelineUrl, permalink, sectionHash, diffLines, changedSpan, fetchRevision, fetchSection } from "./lib/guidelines.js";

const APPLY = process.argv.includes("--apply");
const arg = (n) => process.argv.find((a) => a.startsWith(`--${n}=`))?.split("=").slice(1).join("=");
const PIN = arg("pin");
const REPORT = arg("report");
const MAX_LINES = Number(arg("max-lines") ?? 8);
if (PIN && !/^\d{4}-\d{2}-\d{2}$/.test(PIN)) throw new Error(`--pin needs a date (YYYY-MM-DD), got ${PIN}`);

const reviewUrl = new URL("../data/framing-review.json", import.meta.url);
const review = JSON.parse(await readFile(reviewUrl, "utf-8"));
const clip = (s, n = 200) => (s.length > n ? s.slice(0, n - 1) + "…" : s);

const lines = [];
const say = (s = "") => {
  console.log(s);
  lines.push(s);
};

// One revision lookup per page: several guidelines are sections of the same page.
const revisions = new Map();
const revisionOf = (page) => {
  if (!revisions.has(page)) revisions.set(page, fetchRevision(page, PIN ? `${PIN}T23:59:59Z` : null));
  return revisions.get(page);
};

let edits = 0;
if (PIN) {
  say(`## Guideline versions applied by the reviews: as of ${PIN}`);
  for (const [key, g] of Object.entries(review.guidelines)) {
    const { page, anchor } = parseGuidelineUrl(g.url);
    const rev = await revisionOf(page);
    const text = await fetchSection(rev.revid, anchor);
    if (text === null) throw new Error(`${key}: revision ${rev.revid} of "${page}" has no section "${anchor}"`);
    g.reviewed_revision = { revid: rev.revid, timestamp: rev.timestamp, section_sha1: sectionHash(text) };
    delete g.changed_revision;
    say(`- ${g.name} (${g.shortcut}): revision ${rev.revid} of ${rev.timestamp.slice(0, 10)}, ${permalink(g.url, rev.revid)}`);
    edits++;
  }
} else {
  const changed = [];
  const known = [];
  let same = 0;
  for (const [key, g] of Object.entries(review.guidelines)) {
    const { page, anchor } = parseGuidelineUrl(g.url);
    const base = g.reviewed_revision;
    if (!base) throw new Error(`${key}: no reviewed_revision; record one with --pin=YYYY-MM-DD`);
    const rev = await revisionOf(page);
    const text = await fetchSection(rev.revid, anchor);
    const sha1 = text === null ? null : sectionHash(text);
    if (sha1 === base.section_sha1) {
      same++;
      if (g.changed_revision) {
        say(`- ${g.name}: edited back to the reviewed text (revision ${rev.revid}).`);
        delete g.changed_revision;
        edits++;
      }
      continue;
    }
    const current = { revid: rev.revid, timestamp: rev.timestamp, section_sha1: sha1 };
    if (g.changed_revision?.section_sha1 === sha1) {
      known.push({ g, first: g.changed_revision });
      continue;
    }
    changed.push({ g, anchor, base, current, text });
    g.changed_revision = current;
    edits++;
  }

  say(`## Wikipedia guidelines: ${changed.length} section(s) newly changed, ${known.length} changed earlier, ${same} unchanged since the reviews`);
  for (const { g, anchor, base, current, text } of changed) {
    say(`\n- **${g.name}** (${g.shortcut}): reviews applied revision ${base.revid} (${base.timestamp.slice(0, 10)}), now revision ${current.revid} (${current.timestamp.slice(0, 10)}).`);
    say(`  Compare: https://en.wikipedia.org/w/index.php?diff=${current.revid}&oldid=${base.revid}`);
    if (text === null) {
      say(`  The section "${anchor}" is no longer on the page (renamed or removed): the link on the site needs fixing.`);
      continue;
    }
    const d = diffLines(await fetchSection(base.revid, anchor), text);
    say("  ```diff");
    // the usual edit changes a few words in a paragraph: show each paragraph's changed part
    if (d.removed.length === d.added.length && d.removed.length <= MAX_LINES) {
      d.removed.forEach((l, i) => {
        const { before, after } = changedSpan(l, d.added[i]);
        say(`  - ${before}`);
        say(`  + ${after}`);
      });
      say("  ```");
      continue;
    }
    for (const l of d.removed.slice(0, MAX_LINES)) say(`  - ${clip(l)}`);
    if (d.removed.length > MAX_LINES) say(`  - ... ${d.removed.length - MAX_LINES} more removed`);
    for (const l of d.added.slice(0, MAX_LINES)) say(`  + ${clip(l)}`);
    if (d.added.length > MAX_LINES) say(`  + ... ${d.added.length - MAX_LINES} more added`);
    say("  ```");
  }
  for (const { g, first } of known) {
    say(`\n- ${g.name} (${g.shortcut}): still differs from the reviewed version (first seen in revision ${first.revid}, ${first.timestamp.slice(0, 10)}); shown in an earlier refresh.`);
  }
  if (changed.length) {
    say("\nThese are Wikipedia's edits, not ours. Read whether they change what the wording check flags; if they do, redo the wording check for that guideline and record the new versions with `--pin`. Merging records the edit: the About page then lists the section as edited since the reviews; the reviews themselves do not change.");
  }
}

if (APPLY || PIN) {
  if (edits) {
    await writeFile(reviewUrl, JSON.stringify(review, null, 2) + "\n");
    say(`\nAPPLIED: wrote data/framing-review.json.`);
  } else say("\nNothing to write.");
} else {
  say("\nDry run - nothing written. Re-run with --apply.");
}
if (REPORT) await writeFile(REPORT, lines.join("\n") + "\n");
