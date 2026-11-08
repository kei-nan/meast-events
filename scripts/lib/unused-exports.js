// Exports that no other file mentions (scripts/check-unused-exports.js). An export nothing
// imports is either dead code (syncMirrorReviews was one: exported, tested, never called) or a
// local helper exported by mistake.
//
// The check is textual on purpose: a name counts as used when it appears as a whole word in any
// other scanned file (an import, a call, a test, a comment). That errs towards "used" - a name
// only mentioned in another file's comment passes - and never flags a name that really is
// imported, which a lint step must not do. Exports used only by tests pass (they are exported to
// be tested). Test files themselves are not checked.

// The names a module exports itself: `export function|const|let|var|class|async function NAME`
// and the names in `export { a, b as c }` lists (the exported name). Re-exports `from` another
// module are skipped: their source is checked where it is declared.
export function exportedNames(src) {
  const names = [];
  for (const m of src.matchAll(/^export\s+(?:async\s+)?(?:function\*?|const|let|var|class)\s+([A-Za-z_$][\w$]*)/gm)) names.push(m[1]);
  for (const m of src.matchAll(/^export\s*\{([^}]*)\}\s*(from\b)?/gm)) {
    if (m[2]) continue;
    for (const part of m[1].split(",")) {
      const name = part.trim().split(/\s+as\s+/).pop()?.trim();
      if (name && name !== "default") names.push(name);
    }
  }
  return names;
}

const wordRe = (name) => new RegExp(`(?<![\\w$])${name.replace(/\$/g, "\\$")}(?![\\w$])`);

/**
 * "file: name" for each export of `files` (paths) no other file mentions. `read(file)` gives a
 * file's source; `allowed` holds "file:name" entries a runtime calls by name.
 */
export function unusedExports(files, read, allowed = new Set()) {
  const src = new Map(files.map((f) => [f, read(f)]));
  const out = [];
  for (const f of files) {
    if (/\.test\.m?js$/.test(f)) continue;
    for (const name of exportedNames(src.get(f))) {
      if (allowed.has(`${f}:${name}`)) continue;
      const re = wordRe(name);
      if (!files.some((g) => g !== f && re.test(src.get(g)))) out.push(`${f}: ${name}`);
    }
  }
  return out;
}
