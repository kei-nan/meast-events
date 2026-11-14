// MapLibre's stylesheet without the rules of the controls the app never creates
// (a Vite plugin: vite.config.js; imported by src/components/MapView.jsx as
// "virtual:maplibre-gl.css").
//
// Why: maplibre-gl/dist/maplibre-gl.css styles every built-in control, and most of
// its bytes are inline SVG icons: the MapLibre logo alone is 39 KB of the 72 KB
// (6.16.0, November 2026). The app makes only the map, its default attribution
// control and a Marker (usePlaceMarker.js); its zoom/reset buttons are its own
// (MapNav.jsx). So this drops every rule whose selectors all name a class of a
// control or feature in UNUSED below, and drops each such selector from a rule
// that has others. Everything else is kept as it is, including any class a future
// MapLibre adds: the stylesheet is read from the installed package on every
// build and dev start, never copied, so an upgrade cannot leave a stale copy.
//
// The build fails (trimMaplibreCss, checkAppUsage) if the app starts using one
// of these controls or classes, or if a rule the app needs is no longer found.
import { readFileSync, readdirSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

const APP = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");

// Class-name prefixes ("maplibregl-<prefix>...") of what the app does not create.
const UNUSED = [
  "ctrl-logo", // LogoControl (map option maplibreLogo, off by default)
  "ctrl-group", // the button group of the controls below
  "ctrl-icon",
  "ctrl-zoom-in", // NavigationControl
  "ctrl-zoom-out",
  "ctrl-compass",
  "ctrl-geolocate", // GeolocateControl
  "user-location",
  "ctrl-fullscreen", // FullscreenControl
  "ctrl-shrink",
  "pseudo-fullscreen",
  "ctrl-terrain", // TerrainControl
  "ctrl-globe", // GlobeControl
  "ctrl-scale", // ScaleControl
  "popup", // Popup (the app's border card is its own, MapUi.jsx BoundaryPopup)
  "cooperative-gesture", // map option cooperativeGestures (off by default)
  "mobile-message",
  "desktop-message",
];
// What creates them, so a use of one in src/ fails the build instead of rendering
// unstyled: exports of maplibre-gl, and Map options.
const UNUSED_API = [
  "NavigationControl",
  "GeolocateControl",
  "FullscreenControl",
  "TerrainControl",
  "GlobeControl",
  "ScaleControl",
  "LogoControl",
  "Popup",
  "maplibreLogo",
  "cooperativeGestures",
];
// Selectors that must survive (what the app's map, attribution and marker need);
// one missing means a MapLibre upgrade renamed something this file should follow.
export const REQUIRED = [
  ".maplibregl-map",
  ".maplibregl-canvas",
  ".maplibregl-canvas-container.maplibregl-touch-zoom-rotate.maplibregl-touch-drag-pan",
  ".maplibregl-ctrl-bottom-right",
  ".maplibregl-ctrl-attrib.maplibregl-compact",
  ".maplibregl-ctrl-attrib-button",
  ".maplibregl-marker",
  ".maplibregl-boxzoom",
];

const unusedRe = new RegExp(`\\.maplibregl-(?:${UNUSED.map((p) => p.replace(/[-]/g, "\\-")).join("|")})`);

// The index just past the block that opens at css[open] ("{"), skipping strings.
function blockEnd(css, open) {
  let depth = 0;
  for (let i = open; i < css.length; i++) {
    const c = css[i];
    if (c === '"' || c === "'") {
      i = css.indexOf(c, i + 1);
      if (i < 0) break;
    } else if (c === "{") depth++;
    else if (c === "}" && --depth === 0) return i + 1;
  }
  throw new Error("trim-maplibre-css: unbalanced braces");
}
// The next "{" at top level (outside strings and parentheses) from `from`.
function nextOpen(css, from) {
  let paren = 0;
  for (let i = from; i < css.length; i++) {
    const c = css[i];
    if (c === '"' || c === "'") i = css.indexOf(c, i + 1);
    else if (c === "(") paren++;
    else if (c === ")") paren--;
    else if (c === "{" && !paren) return i;
    else if (c === "}") return -1;
  }
  return -1;
}
// A selector list split at its top-level commas (not those inside :is(...) etc.).
export function splitSelectors(list) {
  const out = [];
  let paren = 0;
  let start = 0;
  for (let i = 0; i < list.length; i++) {
    if (list[i] === "(") paren++;
    else if (list[i] === ")") paren--;
    else if (list[i] === "," && !paren) {
      out.push(list.slice(start, i).trim());
      start = i + 1;
    }
  }
  out.push(list.slice(start).trim());
  return out.filter(Boolean);
}

// The rules of `css` (a block's inside), trimmed. @media and @supports are
// trimmed inside and dropped when empty; other at-rules (@keyframes) are kept
// here and dropped later if nothing names them.
function trimRules(css) {
  let out = "";
  let i = 0;
  while (i < css.length) {
    const open = nextOpen(css, i);
    if (open < 0) {
      out += css.slice(i).trim();
      break;
    }
    const head = css.slice(i, open).trim();
    const end = blockEnd(css, open);
    const body = css.slice(open + 1, end - 1);
    if (/^@(media|supports)\b/.test(head)) {
      const inner = trimRules(body);
      if (inner) out += `${head}{${inner}}`;
    } else if (head.startsWith("@")) {
      out += `${head}{${body}}`;
    } else {
      const kept = splitSelectors(head).filter((s) => !unusedRe.test(s));
      if (kept.length) out += `${kept.join(",")}{${body}}`;
    }
    i = end;
  }
  return out;
}

export function trimMaplibreCss(css) {
  if (css.includes("/*")) css = css.replace(/\/\*[\s\S]*?\*\//g, ""); // the dist file has none
  let out = trimRules(css);
  // @keyframes no kept rule names (the geolocate spinner, the location dot's pulse).
  out = out.replace(/@keyframes\s+([\w-]+)\s*\{/g, (m, name, at) => {
    const rest = out.slice(0, at) + out.slice(blockEnd(out, at + m.length - 1));
    return new RegExp(`animation(?:-name)?\\s*:[^;}]*\\b${name}\\b`).test(rest) ? m : `\0DROP${m}`;
  });
  while (out.includes("\0DROP")) {
    const at = out.indexOf("\0DROP");
    out = out.slice(0, at) + out.slice(blockEnd(out, out.indexOf("{", at)));
  }
  const selectors = new Set();
  for (const m of out.matchAll(/(?:^|})([^{}@]+)\{/g)) for (const s of splitSelectors(m[1])) selectors.add(s);
  const missing = REQUIRED.filter((r) => ![...selectors].some((s) => s === r || s.startsWith(`${r}:`) || s.startsWith(`${r} `)));
  if (missing.length) throw new Error(`trim-maplibre-css: maplibre-gl.css no longer has ${missing.join(", ")}; update scripts/trim-maplibre-css.mjs`);
  return out;
}

// Fails if src/ uses a class or API whose styles are dropped.
export function checkAppUsage(files) {
  const problems = [];
  const apiRe = new RegExp(`\\b(?:${UNUSED_API.join("|")})\\b`);
  for (const [file, text] of files) {
    const cls = text.match(new RegExp(unusedRe.source.slice(2)));
    if (cls) problems.push(`${file} uses ${cls[0]}`);
    // Named imports from maplibre-gl, and Map options in any file that imports it.
    if (/from\s+["']maplibre-gl["']/.test(text)) {
      for (const m of text.matchAll(/import\s*\{([^}]*)\}\s*from\s+["']maplibre-gl["']/g)) {
        const api = m[1].match(apiRe);
        if (api) problems.push(`${file} imports ${api[0]} from maplibre-gl`);
      }
      const opt = text.match(/\b(maplibreLogo|cooperativeGestures)\s*:/);
      if (opt) problems.push(`${file} sets the Map option ${opt[1]}`);
    }
  }
  if (problems.length) {
    throw new Error(
      `trim-maplibre-css: the app uses MapLibre styles this build drops (${problems.join("; ")}); ` +
        "remove the prefix from UNUSED in scripts/trim-maplibre-css.mjs"
    );
  }
}

const listSources = (dir) =>
  readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
    e.isDirectory() ? listSources(path.join(dir, e.name)) : /\.(jsx?|css)$/.test(e.name) && !/\.test\.js$/.test(e.name) ? [path.join(dir, e.name)] : []
  );

const VIRTUAL = "virtual:maplibre-gl.css";
const RESOLVED = `\0${VIRTUAL}`;

export default function maplibreCss() {
  const source = createRequire(path.join(APP, "package.json")).resolve("maplibre-gl/dist/maplibre-gl.css");
  return {
    name: "trim-maplibre-css",
    enforce: "pre",
    resolveId(id) {
      return id === VIRTUAL ? RESOLVED : null;
    },
    load(id) {
      if (id !== RESOLVED) return null;
      this.addWatchFile(source);
      checkAppUsage(listSources(path.join(APP, "src")).map((f) => [path.relative(APP, f), readFileSync(f, "utf8")]));
      return trimMaplibreCss(readFileSync(source, "utf8"));
    },
  };
}
