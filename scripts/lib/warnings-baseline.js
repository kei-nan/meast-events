// The validator's warnings baseline (data/validation-warnings-baseline.json): every warning scripts/validate-events.js
// gives on the committed data, as [file, event id, warning code]. A run lists the warnings not in it as NEW (and
// fails on them), so a new one is not lost among the curated ones printed on every run, and lists baseline entries
// that no longer occur as GONE (to prune; they do not fail). The message is not part of the key: it may carry counts
// that change (a sitelink count, a distance). One entry stands for every warning of that code on that event.
// No imports: pure logic, tested in warnings-baseline.test.js.

export const BASELINE_PATH = "data/validation-warnings-baseline.json";

const cmp = (a, b) => (a < b ? -1 : a > b ? 1 : 0);
const keyOf = ([file, id, code]) => JSON.stringify([file, id, code]);

/** Sorted, de-duplicated [file, id, code] entries; `id` null (a file-level warning) is stored as "". */
export function normalizeEntries(entries) {
  const seen = new Map();
  for (const [file, id, code] of entries) {
    const e = [String(file), id == null ? "" : String(id), String(code)];
    seen.set(keyOf(e), e);
  }
  return [...seen.values()].sort((a, b) => cmp(a[0], b[0]) || cmp(a[1], b[1]) || cmp(a[2], b[2]));
}

/** Reads the baseline file's JSON (its `warnings` list); throws on a malformed one. */
export function parseBaseline(json) {
  const list = json?.warnings;
  if (!Array.isArray(list) || list.some((e) => !Array.isArray(e) || e.length !== 3 || e.some((x) => typeof x !== "string"))) {
    throw new Error(`${BASELINE_PATH}: "warnings" must be an array of [file, event id, code] string triples`);
  }
  return normalizeEntries(list);
}

/**
 * Compares this run's warnings with the baseline.
 * - current: [file, id, code] entries of this run.
 * - files: the files this run validated; baseline entries of other files are neither gone nor rewritten.
 * - skippedCodes: codes of checks that did not run (the pin check without @turf/turf): their entries are not gone.
 * Returns { fresh, gone, next }: `next` is the baseline to write (this run's entries for its files, the baseline's
 * for the others).
 */
export function compareWithBaseline(current, baseline, { files, skippedCodes = [] }) {
  const now = normalizeEntries(current);
  const base = normalizeEntries(baseline);
  const ran = new Set(files);
  const skipped = new Set(skippedCodes);
  const baseKeys = new Set(base.map(keyOf));
  const nowKeys = new Set(now.map(keyOf));
  const fresh = now.filter((e) => !baseKeys.has(keyOf(e)));
  const gone = base.filter((e) => ran.has(e[0]) && !skipped.has(e[2]) && !nowKeys.has(keyOf(e)));
  const next = normalizeEntries([...base.filter((e) => !ran.has(e[0])), ...now]);
  return { fresh, gone, next };
}

/** The baseline file's content. */
export function formatBaseline(entries) {
  const about =
    "Every warning scripts/validate-events.js gives on the committed data, as [file, event id, warning code]. A warning not " +
    "listed here fails the run (CI). Update after checking the new warnings: node scripts/validate-events.js --write-warnings-baseline.";
  const rows = normalizeEntries(entries).map((e) => `    ${JSON.stringify(e)}`);
  return `{\n  "about": ${JSON.stringify(about)},\n  "warnings": [\n${rows.join(",\n")}\n  ]\n}\n`;
}

/**
 * A Markdown report of the new and gone warnings (the monthly refresh puts it in its pull request).
 * `messages` maps a [file, id, code] key (keyOf) to the warning lines of that entry.
 */
export function warningsReport({ fresh, gone, messages = new Map(), written = false }) {
  const verb = written ? "this run wrote them into it" : "not yet in it";
  const lines = ["## Validation warnings", ""];
  if (!fresh.length && !gone.length) {
    lines.push("No new validation warning, and none of the baseline's has gone.");
    return lines.join("\n") + "\n";
  }
  if (fresh.length) {
    lines.push(`**${fresh.length} new warning(s)**: not in \`${BASELINE_PATH}\` before this run (${verb}). Check each one:`, "");
    for (const e of fresh) {
      const msgs = messages.get(keyOf(e)) ?? [];
      lines.push(`- \`${e[0]}\` ${e[1] || "(file)"}, \`${e[2]}\``);
      for (const m of msgs) lines.push(`  - ${m.replace(/\s+/g, " ")}`);
    }
    lines.push("");
  }
  if (gone.length) {
    lines.push(`${gone.length} baseline warning(s) no longer occur (${written ? "this run removed them from the baseline" : "prune them with --write-warnings-baseline"}):`, "");
    for (const e of gone) lines.push(`- \`${e[0]}\` ${e[1] || "(file)"}, \`${e[2]}\``);
    lines.push("");
  }
  return lines.join("\n");
}

export { keyOf as baselineKey };
