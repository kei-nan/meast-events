// Gives each content-hashed file in dist/ its own immutable Cache-Control rule in
// dist/_headers (wired in as "postbuild", after Vite copied public/_headers).
//
// Why per file: Workers matches _headers rules against the REQUESTED path, and a
// path with no file gets 404.html (wrangler.jsonc not_found_handling "404-page")
// with the headers of every rule that matches that path. So a splat rule like
// "/assets/* immutable" also marked the 404 for a missing /assets/ file immutable
// for a year (measured on the live site, 2026-10-18). Hashed URLs are requested
// while missing during a deploy (a page from the old or the new build meeting
// the other build's files), and the same hash returns when a change is reverted:
// a browser that kept that 404 would not load the file again for a year. With a
// rule per existing file, a missing one matches only the splat rule, whose header
// says revalidate.
//
// In public/_headers, a line "#! immutable-per-file" marks the splat rule that
// follows it, e.g. /assets/*. That rule holds the header for a MISSING file. For
// every dist/ entry the splat matches, this adds after it:
//   <file path>           an exact rule, for a file
//   <folder path>/*       for a folder (events/v.<hash>/: the hash names the whole
//                         folder, so all of it is immutable)
// with "! Cache-Control" first, so it replaces the splat's value instead of being
// comma-joined to it (https://developers.cloudflare.com/workers/static-assets/headers/).
//
// Workers reads at most MAX_RULES rules and silently skips the rest, so a marked
// rule whose files would not fit stays a splat (its files then revalidate on
// every visit: slower, still correct) and the script warns. check-dist.mjs
// checks the result.
//
// Run via `npm run build` or `node scripts/expand-headers.mjs` after `vite build`.
import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DIST = path.resolve(process.env.DIST_DIR ?? path.join(__dirname, "..", "dist"));

export const MARKER = "#! immutable-per-file";
export const EXPANDED = "# (expanded by scripts/expand-headers.mjs: per-file rules follow)";
export const IMMUTABLE = "public, max-age=31536000, immutable";
// https://developers.cloudflare.com/workers/static-assets/headers/ (and
// wrangler's MAX_HEADER_RULES, which skips the lines after the 100th rule).
export const MAX_RULES = 100;

// Whether a _headers text has marker lines (that is, is not expanded yet).
export const hasMarker = (text) => text.split(/\r?\n/).some((l) => l.trim() === MARKER);

// The rules of a _headers file, in order: [{pattern, headers: [header lines]}].
// A rule starts at a line in column 0 that is not a comment; its headers are the
// indented lines after it (the format Workers parses).
export function parseRules(text) {
  const rules = [];
  for (const line of text.split(/\r?\n/)) {
    if (!line.trim() || line.trimStart().startsWith("#")) continue;
    if (/^\s/.test(line)) rules.at(-1)?.headers.push(line.trim());
    else rules.push({ pattern: line.trim(), headers: [] });
  }
  return rules;
}

// The paths a marked splat pattern expands to. `list(dir)` returns the entries of
// a dist/ folder ("" is the root) as fs.Dirent-likes ({name, isDirectory()}).
export function expandPattern(pattern, list) {
  if (!/^\/[^*]*\*$/.test(pattern)) throw new Error(`${MARKER}: ${pattern} must be a path ending in its only "*"`);
  const prefix = pattern.slice(0, -1);
  const dir = prefix.slice(0, prefix.lastIndexOf("/") + 1);
  const start = prefix.slice(dir.length);
  return list(dir.slice(1, -1))
    .filter((e) => e.name.startsWith(start))
    .map((e) => {
      // ":" starts a placeholder and "*" a splat in a rule; a hashed name has neither.
      if (/[\s:*]/.test(e.name)) throw new Error(`${MARKER}: cannot write a rule for ${dir}${e.name}`);
      return e.isDirectory() ? `${dir}${e.name}/*` : `${dir}${e.name}`;
    })
    .sort();
}

// _headers text with the per-file rules added. Returns {text, added, kept}: kept
// lists the marked patterns left as splats for lack of room.
export function expandHeaders(text, list, maxRules = MAX_RULES) {
  const lines = text.split(/\r?\n/);
  // Each marked rule: the line its block ends on and the paths it expands to.
  const marked = [];
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].trim() !== MARKER) continue;
    let j = i + 1;
    if (j >= lines.length || !lines[j].startsWith("/")) throw new Error(`${MARKER} on line ${i + 1} is not followed by a rule`);
    const pattern = lines[j].trim();
    while (j + 1 < lines.length && /^\s+\S/.test(lines[j + 1])) j++;
    marked.push({ pattern, end: j, paths: expandPattern(pattern, list) });
  }
  // Smallest first, so one large expansion (the search index grows with the data)
  // cannot crowd out several small ones.
  let room = maxRules - parseRules(text).length;
  for (const m of [...marked].sort((a, b) => a.paths.length - b.paths.length)) {
    m.fits = m.paths.length <= room;
    if (m.fits) room -= m.paths.length;
  }
  const after = new Map(marked.filter((m) => m.fits).map((m) => [m.end, m.paths]));
  const out = [];
  lines.forEach((line, i) => {
    // The marker becomes a plain comment, so a second run finds none and stops
    // instead of adding every rule twice.
    out.push(line.trim() === MARKER ? EXPANDED : line);
    for (const p of after.get(i) ?? []) out.push("", p, "  ! Cache-Control", `  Cache-Control: ${IMMUTABLE}`);
  });
  return {
    text: out.join("\n"),
    added: [...after.values()].reduce((n, paths) => n + paths.length, 0),
    kept: marked.filter((m) => !m.fits).map((m) => m.pattern),
  };
}

const listDist = (dist) => (rel) => {
  try {
    return readdirSync(path.join(dist, ...rel.split("/").filter(Boolean)), { withFileTypes: true });
  } catch (err) {
    if (err.code === "ENOENT") return [];
    throw err;
  }
};

// The CLI: node scripts/expand-headers.mjs (DIST_DIR overrides dist/).
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const file = path.join(DIST, "_headers");
  const src = readFileSync(file, "utf8");
  if (!hasMarker(src)) {
    // Already expanded (a run replaces the markers), or the template lost them.
    console.error(`expand-headers: ${file} has no "${MARKER}" line`);
    process.exit(1);
  }
  const { text, added, kept } = expandHeaders(src, listDist(DIST));
  writeFileSync(file, text);
  for (const p of kept) console.warn(`expand-headers: warning - no room under the ${MAX_RULES}-rule limit for ${p}: its files will revalidate on every visit`);
  console.log(`expand-headers: ${added} per-file immutable rules, ${parseRules(text).length} rules in all (limit ${MAX_RULES})`);
}
