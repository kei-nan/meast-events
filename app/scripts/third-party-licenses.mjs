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
// the package; a package without such a file is listed with its declared licence and says so.
// No dependency: node built-ins only. Fails the build if it finds no package at all (a broken module scan).
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

const EXTRA = ["@fontsource-variable/inter", "@fontsource/spectral", "pagefind"];
export const FILE_NAME = "third-party-licenses.txt";

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

const LICENSE_FILE =/^(licen[cs]e|copying)(\.(md|txt|markdown))?$/i;

// One package's entry as plain text.
export function packageNotice(dir) {
  const pkg = JSON.parse(readFileSync(join(dir, "package.json"), "utf8"));
  const licence = typeof pkg.license === "string" ? pkg.license : (pkg.license?.type ?? "(none declared)");
  const file = readdirSync(dir, { withFileTypes: true }).find((f) => f.isFile() && LICENSE_FILE.test(f.name))?.name;
  const head = `${pkg.name} ${pkg.version} - ${licence}${pkg.homepage ? ` - ${pkg.homepage}` : ""}`;
  const text = file
    ? readFileSync(join(dir, file), "utf8").replace(/\r\n/g, "\n").trim()
    : `(The package ships no licence file; its package.json declares ${licence}.)`;
  return { name: pkg.name, text: `${"=".repeat(78)}\n${head}\n${"=".repeat(78)}\n\n${text}\n` };
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
      const notices = [...dirs.values()].map(packageNotice).sort((a, b) => a.name.localeCompare(b.name));
      if (!notices.some((n) => n.name === "maplibre-gl")) {
        this.error("third-party-licenses: maplibre-gl is not among the bundled packages (module scan broken?)");
      }
      const intro =
        "middleeast.events - third-party software shipped in this site\n\n" +
        "The site's own source code is AGPL-3.0 (https://github.com/kei-nan/meast-events/blob/main/LICENSE);\n" +
        "data and other credits: https://github.com/kei-nan/meast-events/blob/main/NOTICE\n\n" +
        "Below: the packages whose code or fonts are in the built site, with their licence notices,\n" +
        "generated at build time by app/scripts/third-party-licenses.mjs.\n\n";
      this.emitFile({ type: "asset", fileName: FILE_NAME, source: intro + notices.map((n) => n.text).join("\n") });
    },
  };
}
