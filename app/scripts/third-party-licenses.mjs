// Vite plugin (vite.config.js): writes dist/third-party-licenses.txt, the licence notices of the third-party
// packages whose code or fonts ship in the built site. MapLibre GL JS is BSD-3-Clause, whose second clause
// requires its notice in the documentation or other materials of a redistribution in binary form (the minified
// bundle is one), and the MIT packages (React, uqr, Pagefind) ask for theirs in all copies; NOTICE and the
// "Sources & licences" dialog (src/components/AboutData.jsx) link to the file.
//
// Which packages: every node_modules package with a module in the production bundle (Rollup's module graph,
// so a dependency that is installed but not bundled is not listed), plus EXTRA, which ship without passing
// through the module graph: the fontsource fonts that scripts/subset-fonts.mjs subsets into the bundle, and
// Pagefind, whose search runtime scripts/build-search-index.mjs writes to dist/pagefind/. A package that ships
// a prebuilt bundle (maplibre-gl's dist/maplibre-gl.mjs and its worker inline kdbush, earcut, pbf, gl-matrix,
// the @mapbox/* and @maplibre/* packages and others) shows up in the module graph as itself only, so for each
// bundled module that has a source map next to it, the packages named in the map's `sources` are listed too
// (bundledPackagesOf), read from the installed copy (the package's own node_modules first, then the app's).
// For each package the
// file holds its name, version, declared licence, homepage and its LICENSE/LICENCE/COPYING file as shipped in
// the package (or every file of such a directory); a package that ships none takes its text from a vendored
// file in scripts/licenses/ that cites its source, and without one is listed with its declared licence and
// says so.
// No dependency: node built-ins only. Fails the build if it finds no package at all (a broken module scan).
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const EXTRA = ["@fontsource-variable/inter", "@fontsource/spectral", "pagefind"];
const FILE_NAME = "third-party-licenses.txt";

// "…/node_modules/@scope/name/dist/x.js?url" -> { name: "@scope/name", dir: "…/node_modules/@scope/name" }.
// The LAST node_modules segment wins (a nested copy is its own package); dot folders (.cache, .vite) are not
// packages. Returns null for a module outside node_modules (the app's own source, virtual modules).
export function packageOf(id) {
  const path = String(id).split("?")[0].replace(/\\/g, "/");
  const last = [...path.matchAll(/\/node_modules\/((?:@[^/]+\/)?[^/]+)/g)].at(-1);
  if (!last || last[1].startsWith(".")) return null;
  return { name: last[1], dir: path.slice(0, last.index + last[0].length) };
}

// The packages inlined into a prebuilt file, from the source map beside it ("<file>.map"): every node_modules
// package its `sources` name, other than `self` (the package that ships the file). [] without a map.
export function bundledPackagesOf(file, self) {
  const map = `${String(file).split("?")[0]}.map`;
  if (!existsSync(map)) return [];
  const { sources = [] } = JSON.parse(readFileSync(map, "utf8"));
  const names = new Set();
  for (const s of sources) {
    const p = packageOf(`/${s}`);
    if (p && p.name !== self) names.add(p.name);
  }
  return [...names].sort();
}

const LICENSE_FILE = /^(licen[cs]e|copying)(\.(md|txt|markdown))?$/i;
// Licence texts for packages that ship none (scripts/licenses/<name>.txt, "/" in a scoped name as "__"), each
// saying where its text was taken from.
export const OVERRIDES_DIR = fileURLToPath(new URL("./licenses/", import.meta.url));

const readText = (path) => readFileSync(path, "utf8").replace(/\r\n/g, "\n").trim();

// The package's licence text: a LICENSE/LICENCE/COPYING file at its root; else such a directory (Pagefind ships
// LICENSE/LICENSE and LICENSE/LICENSE-vscode-ripgrep), every file in it, by name; else the vendored override;
// else null.
function licenceText(dir, name, overridesDir) {
  const entries = readdirSync(dir, { withFileTypes: true }).filter((f) => LICENSE_FILE.test(f.name));
  const file = entries.find((f) => f.isFile());
  if (file) return readText(join(dir, file.name));
  const folder = entries.find((f) => f.isDirectory());
  if (folder) {
    const files = readdirSync(join(dir, folder.name), { withFileTypes: true })
      .filter((f) => f.isFile())
      .map((f) => f.name)
      .sort();
    if (files.length) {
      return files.map((f) => `--- ${folder.name}/${f} ---\n\n${readText(join(dir, folder.name, f))}`).join("\n\n");
    }
  }
  const override = join(overridesDir, `${name.replace("/", "__")}.txt`);
  return existsSync(override) ? readText(override) : null;
}

// One package's entry as plain text.
export function packageNotice(dir, overridesDir = OVERRIDES_DIR) {
  const pkg = JSON.parse(readFileSync(join(dir, "package.json"), "utf8"));
  const licence = typeof pkg.license === "string" ? pkg.license : (pkg.license?.type ?? "(none declared)");
  const head = `${pkg.name} ${pkg.version} - ${licence}${pkg.homepage ? ` - ${pkg.homepage}` : ""}`;
  const text =
    licenceText(dir, pkg.name, overridesDir) ??
    `(The package ships no licence file; its package.json declares ${licence}.)`;
  return { name: pkg.name, text: `${"=".repeat(78)}\n${head}\n${"=".repeat(78)}\n\n${text}\n` };
}

// The Rust crates compiled into Pagefind's WebAssembly (dist/pagefind/v.*/wasm.*.pagefind): Pagefind ships no
// notices for them, so they are vendored in scripts/licenses/pagefind-wasm/ (manifest.json: each crate's version
// from pagefind_web/Cargo.lock, its declared licence, and the source of every text), collected for one Pagefind
// version. Throws when the installed Pagefind is another version: an upgrade can change the crates, so the
// notices must be collected again (and manifest.json's "pagefind" updated) before the build passes.
export const PAGEFIND_WASM_DIR = join(OVERRIDES_DIR, "pagefind-wasm");
export function pagefindWasmNotices(pagefindDir, dir = PAGEFIND_WASM_DIR) {
  const manifest = JSON.parse(readFileSync(join(dir, "manifest.json"), "utf8"));
  const { version } = JSON.parse(readFileSync(join(pagefindDir, "package.json"), "utf8"));
  if (version !== manifest.pagefind) {
    throw new Error(
      `third-party-licenses: Pagefind ${version} is installed, but the notices in ${dir} are for Pagefind ` +
        `${manifest.pagefind}; collect them again from its pagefind_web/Cargo.lock and update manifest.json`
    );
  }
  const bar = "=".repeat(78);
  const parts = [`${bar}\nRust crates compiled into Pagefind's search (wasm)\n${bar}\n\n${manifest.intro.join("\n")}`];
  for (const c of manifest.crates) {
    const lines = [`--- ${c.name} ${c.version} - ${c.license}${c.usedUnder ? ` (used under ${c.usedUnder})` : ""} ---`];
    if (c.note) lines.push("", c.note);
    for (const s of c.correspondingSource ?? []) lines.push("", `Corresponding source: ${s}`);
    for (const f of c.files) lines.push("", `Source: ${f.source}`, "", readText(join(dir, f.file)));
    parts.push(lines.join("\n"));
  }
  if (manifest.notCompiledIn) parts.push(`${manifest.notCompiledIn.note}\n${manifest.notCompiledIn.crates.join(", ")}.`);
  return `${parts.join("\n\n")}\n`;
}

export default function thirdPartyLicenses() {
  let root = process.cwd();
  return {
    name: "third-party-licenses",
    apply: "build",
    configResolved(config) {
      root = config.root;
    },
    generateBundle() {
      const dirs = new Map();
      for (const id of this.getModuleIds()) {
        const p = packageOf(id);
        if (!p || !existsSync(join(p.dir, "package.json"))) continue;
        dirs.set(p.name, p.dir);
        for (const name of bundledPackagesOf(id, p.name)) {
          const dir = [join(p.dir, "node_modules", name), join(root, "node_modules", name)].find((d) =>
            existsSync(join(d, "package.json"))
          );
          if (!dir) this.error(`third-party-licenses: ${name}, bundled in ${p.name}, is not installed`);
          dirs.set(name, dir);
        }
      }
      // app/node_modules/<name> directly: not every package exports its package.json to require.resolve
      for (const name of EXTRA) dirs.set(name, join(root, "node_modules", name));
      const notices = [...dirs.values()].map((dir) => packageNotice(dir)).sort((a, b) => a.name.localeCompare(b.name));
      if (!notices.some((n) => n.name === "maplibre-gl")) {
        this.error("third-party-licenses: maplibre-gl is not among the bundled packages (module scan broken?)");
      }
      const intro =
        "middleeast.events - third-party software shipped in this site\n\n" +
        "The site's own source code is AGPL-3.0 (https://github.com/kei-nan/meast-events/blob/main/LICENSE);\n" +
        "data and other credits: https://github.com/kei-nan/meast-events/blob/main/NOTICE\n\n" +
        "Below: the packages whose code or fonts are in the built site, with their licence notices,\n" +
        "generated at build time by app/scripts/third-party-licenses.mjs.\n\n";
      let wasm;
      try {
        wasm = pagefindWasmNotices(join(root, "node_modules", "pagefind"));
      } catch (err) {
        this.error(err.message);
      }
      const source = intro + notices.map((n) => n.text).join("\n") + "\n" + wasm;
      this.emitFile({ type: "asset", fileName: FILE_NAME, source });
    },
  };
}
