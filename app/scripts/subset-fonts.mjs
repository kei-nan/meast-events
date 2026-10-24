// Subsets the self-hosted web fonts to the characters the site can show, and writes
// an @font-face stylesheet for them (imported by src/main.jsx as
// "@subset-fonts/fonts.css", an alias set in vite.config.js).
//
// Why: the fontsource stylesheets split each font by script (latin, latin-ext,
// cyrillic, ...). The data has about 30 extended-Latin characters (transliterations
// such as ā ğ İ ı ş ṭ ʿ), so every first visit downloaded the whole 83 KB Inter latin-ext
// file for them. This keeps the same split and the same unicode-ranges, but each
// file holds only the characters that occur: Inter latin-ext went from 83 KB to
// 7 KB, and the fonts of the default view from 156 KB to 67 KB (October 2026).
//
// Characters kept, for every face whose fontsource unicode-range covers them:
//   - all of Basic Latin (U+0020-007E), Latin-1 (U+00A0-00FF) and General
//     Punctuation (U+2000-206F), whether used or not;
//   - every character in a string of any JSON or .tbin file under public/data/ (the
//     files the browser loads, written by split-data.mjs, so run this after it; a
//     .tbin is read decoded, src/lib/geoCodec.js), which covers titles, extracts,
//     labels, border names, the framing review and the funnel;
//   - every character in the app's source (src/**/*.{js,jsx,css}, index.html),
//     with \u escapes and HTML character references decoded, for the UI strings.
// Characters no fontsource subset covers (Arabic, Hebrew, ...) keep falling back to
// the system fonts after "<family> fallback", exactly as before.
//
// The map labels (MapLibre draws them in the browser from a CSS family; see
// src/lib/labelFont.js) get Inter's faces once more under the family
// LABEL_FONT_FAMILY, with the same files and their unicode-range cut down to the
// label characters: all of Basic Latin (cluster counts, the search-area radius)
// and every boundary `name` in public/data/boundaries/. A label character no Inter
// face covers fails the run (it would be drawn in a system font).
//
// Inter stays a variable font (harfbuzz keeps the wght axis); Spectral is the single
// 600 weight. font-display, font-weight and the unicode-range of each face are
// copied from the fontsource CSS (only intersected with the characters used), in
// the same order, so fontaine (vite.config.js) still measures its fallback metrics
// from the Latin face, which it reads last.
//
// Output: node_modules/.cache/subset-fonts/ (not committed; rebuilt on every dev
// start and build, including Cloudflare's).
//   node scripts/subset-fonts.mjs
import { mkdirSync, readFileSync, readdirSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { decodeGeo } from "../src/lib/geoCodec.js";
import path from "node:path";
import { fileURLToPath } from "node:url";
import subsetFont from "subset-font";
import { LABEL_FONT_FAMILY } from "../src/lib/labelFont.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const APP = path.join(__dirname, "..");
const OUT_DIR = path.join(APP, "node_modules", ".cache", "subset-fonts");
const require = createRequire(import.meta.url);

// The stylesheets src/main.jsx used to import, one per family.
// `label`: the family the map labels are drawn from.
const SOURCES = [
  { prefix: "inter", css: require.resolve("@fontsource-variable/inter/wght.css"), label: true },
  { prefix: "spectral", css: require.resolve("@fontsource/spectral/600.css") },
];

const ALWAYS = [
  [0x20, 0x7e],
  [0xa0, 0xff],
  [0x2000, 0x206f],
];

// --- characters -------------------------------------------------------------
const chars = new Set();
const addText = (s) => {
  for (const ch of s) {
    const cp = ch.codePointAt(0);
    if (cp >= 0x20 && !(cp >= 0x7f && cp <= 0x9f)) chars.add(cp);
  }
};
for (const [a, b] of ALWAYS) for (let cp = a; cp <= b; cp++) chars.add(cp);

const walkJSON = (v) => {
  if (typeof v === "string") addText(v);
  else if (Array.isArray(v)) v.forEach(walkJSON);
  else if (v && typeof v === "object") {
    for (const [k, x] of Object.entries(v)) {
      addText(k);
      walkJSON(x);
    }
  }
};
const listFiles = (dir) =>
  readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
    e.isDirectory() ? listFiles(path.join(dir, e.name)) : [path.join(dir, e.name)]
  );
// The geometry files (.tbin: land and boundaries, with the border names), decoded.
// A missing public/data/ is reported below.
try {
  for (const f of listFiles(path.join(APP, "public", "data")).filter((f) => f.endsWith(".tbin"))) walkJSON(decodeGeo(readFileSync(f)));
} catch (err) {
  if (err.code !== "ENOENT") throw err;
}

const dataDir = path.join(APP, "public", "data");
let dataFiles = [];
try {
  dataFiles = listFiles(dataDir).filter((f) => f.endsWith(".json"));
} catch {
  // handled below
}
if (!dataFiles.length) {
  console.error(`subset-fonts: no JSON under ${dataDir}; run scripts/split-data.mjs first`);
  process.exit(1);
}
for (const f of dataFiles) walkJSON(JSON.parse(readFileSync(f, "utf8")));

// The map label characters (see the top of the file).
const labelChars = new Set();
for (let cp = 0x20; cp <= 0x7e; cp++) labelChars.add(cp);
const boundariesDir = path.join(dataDir, "boundaries");
// The decade files (<decade>.tbin, read decoded). Finding none fails the run: the
// border names would go unchecked, as happened when they moved from .json to .tbin.
const decadeFiles = readdirSync(boundariesDir).filter((n) => /^\d{4}\.tbin$/.test(n));
if (!decadeFiles.length) {
  console.error(`subset-fonts: no <decade>.tbin under ${boundariesDir}; run scripts/split-data.mjs first`);
  process.exit(1);
}
for (const f of decadeFiles) {
  for (const { properties } of decodeGeo(readFileSync(path.join(boundariesDir, f))).features) {
    for (const ch of properties?.name ?? "") labelChars.add(ch.codePointAt(0));
  }
}

const decodeSource = (s) =>
  s
    .replace(/\\u\{([0-9a-fA-F]+)\}/g, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/\\u([0-9a-fA-F]{4})/g, (_, h) => String.fromCharCode(parseInt(h, 16)))
    .replace(/&#x([0-9a-fA-F]+);/g, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)));
// Named references that occur in the JSX (all in Latin-1 / General Punctuation,
// which are kept anyway; listed so a new one is not silently missed).
const NAMED = { amp: "&", apos: "'", quot: '"', lt: "<", gt: ">", nbsp: " ", ldquo: "“", rdquo: "”", lsquo: "‘", rsquo: "’", mdash: "—", ndash: "–", hellip: "…", middot: "·", times: "×", rarr: "→", larr: "←", copy: "©" };
const sourceFiles = [
  ...listFiles(path.join(APP, "src")).filter((f) => /\.(jsx?|css)$/.test(f) && !/\.test\.js$/.test(f)),
  path.join(APP, "index.html"),
];
for (const f of sourceFiles) {
  const text = decodeSource(readFileSync(f, "utf8")).replace(/&([a-z]+);/g, (m, n) => NAMED[n] ?? m);
  addText(text);
}

// --- fontsource faces ---------------------------------------------------------
const parseRange = (range) => {
  const set = new Set();
  for (const part of range.split(",")) {
    const m = part.trim().match(/^U\+([0-9A-F]+)(?:-([0-9A-F]+))?$/i);
    if (!m) throw new Error(`subset-fonts: cannot parse unicode-range part ${JSON.stringify(part)}`);
    const a = parseInt(m[1], 16);
    const b = m[2] ? parseInt(m[2], 16) : a;
    for (let cp = a; cp <= b; cp++) set.add(cp);
  }
  return set;
};
const formatRange = (cps) => {
  const sorted = [...cps].sort((a, b) => a - b);
  const out = [];
  const hex = (n) => n.toString(16).toUpperCase().padStart(4, "0");
  for (let i = 0; i < sorted.length; ) {
    let j = i;
    while (j + 1 < sorted.length && sorted[j + 1] === sorted[j] + 1) j++;
    out.push(i === j ? `U+${hex(sorted[i])}` : `U+${hex(sorted[i])}-${hex(sorted[j])}`);
    i = j + 1;
  }
  return out.join(",");
};
const prop = (block, name) => block.match(new RegExp(`${name}\\s*:\\s*([^;]+);`))?.[1].trim();

// Everything is written to a private folder first and then moved into OUT_DIR one
// file at a time (a rename within the same folder tree replaces the file in one
// step), fonts.css last. OUT_DIR is never emptied, so a second build or dev server
// running at the same time (Vite reads OUT_DIR through @subset-fonts) always sees
// complete files, never a missing folder or a half-written font.
const TMP_DIR = `${OUT_DIR}.tmp-${process.pid}-${Date.now()}`;
mkdirSync(TMP_DIR, { recursive: true });
const written = [];
const stage = (name, content) => {
  writeFileSync(path.join(TMP_DIR, name), content);
  written.push(name);
};
// Windows refuses a rename onto a file another process has open (EPERM, EBUSY,
// EACCES) for a moment; retry briefly.
const sleep = (ms) => Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
function moveInto(name) {
  for (let attempt = 0; ; attempt++) {
    try {
      renameSync(path.join(TMP_DIR, name), path.join(OUT_DIR, name));
      return;
    } catch (err) {
      if (attempt >= 20 || !["EPERM", "EBUSY", "EACCES"].includes(err.code)) throw err;
      sleep(50 * (attempt + 1));
    }
  }
}
function publish() {
  mkdirSync(OUT_DIR, { recursive: true });
  // Fonts first, then the stylesheet that names them.
  for (const name of written.filter((n) => n !== "fonts.css")) moveInto(name);
  moveInto("fonts.css");
  const keep = new Set(written);
  for (const name of readdirSync(OUT_DIR)) if (!keep.has(name)) rmSync(path.join(OUT_DIR, name), { force: true, recursive: true });
  rmSync(TMP_DIR, { recursive: true, force: true });
}
let css =
  "/* Generated by scripts/subset-fonts.mjs from the fontsource stylesheets; do not edit. */\n";
let labelCss = "";
const labelCovered = new Set();
let before = 0;
let after = 0;
const summary = [];
for (const { prefix, css: cssPath, label } of SOURCES) {
  const source = readFileSync(cssPath, "utf8");
  for (const block of source.match(/@font-face\s*\{[^}]*\}/g) ?? []) {
    const src = prop(block, "src");
    const woff2 = src?.match(/url\(([^)]+\.woff2)\)\s*format\(([^)]+)\)/);
    const range = prop(block, "unicode-range");
    if (!woff2 || !range) throw new Error(`subset-fonts: unexpected @font-face in ${cssPath}:\n${block}`);
    const keep = [...parseRange(range)].filter((cp) => chars.has(cp));
    if (!keep.length) continue;
    const file = path.join(path.dirname(cssPath), woff2[1]);
    const input = readFileSync(file);
    const output = await subsetFont(input, String.fromCodePoint(...keep), { targetFormat: "woff2" });
    const name = path.basename(file);
    if (!name.startsWith(prefix)) throw new Error(`subset-fonts: ${name} does not start with ${prefix}`);
    stage(name, output);
    before += input.length;
    after += output.length;
    summary.push(`${name.replace(/\.woff2$/, "")} ${keep.length} chars ${Math.round(input.length / 1024)}->${Math.round(output.length / 1024)} KB`);
    css +=
      `@font-face {\n` +
      `  font-family: ${prop(block, "font-family")};\n` +
      `  font-style: ${prop(block, "font-style")};\n` +
      `  font-display: ${prop(block, "font-display")};\n` +
      `  font-weight: ${prop(block, "font-weight")};\n` +
      `  src: url(./${name}) format(${woff2[2]});\n` +
      `  unicode-range: ${formatRange(keep)};\n` +
      `}\n`;
    const labelKeep = label ? keep.filter((cp) => labelChars.has(cp)) : [];
    if (labelKeep.length) {
      labelKeep.forEach((cp) => labelCovered.add(cp));
      labelCss +=
        `@font-face {\n` +
        `  font-family: "${LABEL_FONT_FAMILY}";\n` +
        `  font-style: ${prop(block, "font-style")};\n` +
        `  font-display: ${prop(block, "font-display")};\n` +
        `  font-weight: ${prop(block, "font-weight")};\n` +
        `  src: url(./${name}) format(${woff2[2]});\n` +
        `  unicode-range: ${formatRange(labelKeep)};\n` +
        `}\n`;
    }
  }
}
const uncovered = [...labelChars].filter((cp) => !labelCovered.has(cp));
if (uncovered.length) {
  const list = uncovered.map((cp) => `${String.fromCodePoint(cp)} U+${cp.toString(16).toUpperCase().padStart(4, "0")}`);
  console.error(`subset-fonts: map label characters no Inter face covers: ${list.join(", ")}`);
  rmSync(TMP_DIR, { recursive: true, force: true });
  process.exit(1);
}
// After the page's faces: fontaine (vite.config.js) reads the Latin Inter face last.
css += labelCss;
stage("fonts.css", css);
publish();
console.log(
  `subset-fonts: ${chars.size} characters from ${dataFiles.length} data files and ${sourceFiles.length} source files ` +
    `(${labelChars.size} in map labels); ` +
    `${summary.length} faces, ${Math.round(before / 1024)} -> ${Math.round(after / 1024)} KB (${summary.join("; ")})`
);
