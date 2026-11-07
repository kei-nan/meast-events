import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, mkdtempSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  bundledPackagesOf,
  OVERRIDES_DIR,
  PAGEFIND_WASM_DIR,
  packageNotice,
  packageOf,
  pagefindWasmNotices,
} from "./third-party-licenses.mjs";

test("packageOf: the package a bundled module belongs to", () => {
  assert.deepEqual(packageOf("/a/app/node_modules/maplibre-gl/dist/maplibre-gl.js"), {
    name: "maplibre-gl",
    dir: "/a/app/node_modules/maplibre-gl",
  });
  // Windows paths, a query suffix, a scoped package
  assert.deepEqual(packageOf("C:\\a\\app\\node_modules\\@scope\\pkg\\x.mjs?url"), {
    name: "@scope/pkg",
    dir: "C:/a/app/node_modules/@scope/pkg",
  });
  // a nested copy is its own package
  assert.equal(packageOf("/a/node_modules/react-dom/node_modules/scheduler/index.js").name, "scheduler");
  // the app's own source, virtual modules and dot folders (Vite's caches) are not packages
  assert.equal(packageOf("/a/app/src/main.jsx"), null);
  assert.equal(packageOf("\0vite/modulepreload-polyfill.js"), null);
  assert.equal(packageOf("/a/app/node_modules/.cache/subset-fonts/fonts.css"), null);
});

// A package laid out like maplibre-gl in a temporary folder: no node_modules needed (the refresh workflow runs
// these tests before app/'s npm ci).
function fakePackage(files) {
  const root = mkdtempSync(join(tmpdir(), "tpl-"));
  const dir = join(root, "node_modules", "maplibre-gl");
  mkdirSync(dir, { recursive: true });
  for (const [name, text] of Object.entries(files)) {
    if (text === null) mkdirSync(join(dir, name));
    else writeFileSync(join(dir, name), text);
  }
  return { root, dir };
}

test("packageNotice: name, version, licence and the package's own licence text", () => {
  const { root, dir } = fakePackage({
    "package.json": JSON.stringify({ name: "maplibre-gl", version: "6.14.0", license: "BSD-3-Clause", homepage: "https://maplibre.org/" }),
    "LICENSE.txt": "Copyright (c) 2023, MapLibre contributors\r\n\r\nRedistributions in binary form must reproduce the above copyright notice\r\n",
    licenses: null, // a directory named like a licence file is skipped
  });
  try {
    const n = packageNotice(dir);
    assert.equal(n.name, "maplibre-gl");
    const bar = "=".repeat(78);
    assert.equal(
      n.text,
      `${bar}\nmaplibre-gl 6.14.0 - BSD-3-Clause - https://maplibre.org/\n${bar}\n\n` +
        "Copyright (c) 2023, MapLibre contributors\n\nRedistributions in binary form must reproduce the above copyright notice\n"
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("packageNotice: a package without a licence file says so", () => {
  const { root, dir } = fakePackage({ "package.json": JSON.stringify({ name: "maplibre-gl", version: "1.0.0", license: "MIT" }) });
  try {
    assert.ok(packageNotice(dir).text.includes("(The package ships no licence file; its package.json declares MIT.)"));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("packageNotice: a licence directory gives every file in it, by name (Pagefind's LICENSE/)", () => {
  const { root, dir } = fakePackage({
    "package.json": JSON.stringify({ name: "maplibre-gl", version: "1.0.0", license: "MIT" }),
    LICENSE: null,
  });
  writeFileSync(join(dir, "LICENSE", "LICENSE-other"), "Copyright (c) Other\r\n");
  writeFileSync(join(dir, "LICENSE", "LICENSE"), "Copyright (c) Pagefind\n");
  try {
    const { text } = packageNotice(dir);
    assert.ok(text.endsWith("--- LICENSE/LICENSE ---\n\nCopyright (c) Pagefind\n\n--- LICENSE/LICENSE-other ---\n\nCopyright (c) Other\n"));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("packageNotice: a package that ships no licence takes the vendored override", () => {
  const { root, dir } = fakePackage({ "package.json": JSON.stringify({ name: "maplibre-gl", version: "1.0.0", license: "MIT" }) });
  const overrides = join(root, "overrides");
  mkdirSync(overrides);
  writeFileSync(join(overrides, "maplibre-gl.txt"), "(Taken from https://example.org/README.md)\r\n\r\nCopyright (c) 2011 Someone\r\n");
  try {
    const { text } = packageNotice(dir, overrides);
    assert.ok(text.endsWith("(Taken from https://example.org/README.md)\n\nCopyright (c) 2011 Someone\n"));
    assert.ok(!text.includes("ships no licence file"));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("packageNotice: the vendored murmurhash-js text names its source and its copyright", () => {
  const text = readFileSync(join(OVERRIDES_DIR, "murmurhash-js.txt"), "utf8");
  assert.match(text, /https:\/\/github\.com\/mikolalysenko\/murmurhash-js\/blob\/[0-9a-f]{40}\/README\.md/);
  assert.match(text, /Copyright \(c\) 2011 Gary Court/);
  assert.match(text, /Permission is hereby granted, free of charge/);
});

// A node_modules/pagefind with just a package.json of the given version.
function fakePagefind(version) {
  const root = mkdtempSync(join(tmpdir(), "tpl-pf-"));
  writeFileSync(join(root, "package.json"), JSON.stringify({ name: "pagefind", version }));
  return root;
}
const wasmManifest = JSON.parse(readFileSync(join(PAGEFIND_WASM_DIR, "manifest.json"), "utf8"));

test("NOTICE names every Pagefind wasm crate whose licence is neither MIT nor Apache-2.0, and the Snowball stemmers", () => {
  const notice = readFileSync(new URL("../../NOTICE", import.meta.url), "utf8").replace(/\s+/g, " ");
  const permissive = /^\(?(MIT|Apache-2\.0)( OR (MIT|Apache-2\.0))?\)?( AND Unicode-3\.0)?$/;
  const others = wasmManifest.crates.filter((c) => !permissive.test(c.license));
  assert.deepEqual(others.map((c) => c.name).sort(), ["minicbor", "pagefind_microjson"]);
  for (const c of others) assert.ok(notice.includes(`${c.name}, ${c.license}`), `NOTICE: ${c.name}, ${c.license}`);
  // pagefind_stem is MIT, but carries the Snowball stemmers' BSD-3-Clause notice (manifest note).
  assert.match(wasmManifest.crates.find((c) => c.name === "pagefind_stem").note, /Snowball stemmers \(BSD-3-Clause\)/);
  assert.ok(notice.includes("Snowball stemmers in pagefind_stem, BSD 3-Clause"));
});

test("NOTICE and data/LICENSE credit the Wikipedia text on the map: city and water names, the quoted rename sentences", () => {
  for (const f of ["../../NOTICE", "../../data/LICENSE"]) {
    const text = readFileSync(new URL(f, import.meta.url), "utf8").replace(/\s+/g, " ");
    assert.ok(text.includes("city and water names"), f);
    assert.ok(text.includes("quoted") && text.includes("scripts/build-cities.js"), f);
  }
});

test("pagefindWasmNotices: another Pagefind version fails the build, so an upgrade forces a re-check", () => {
  const root = fakePagefind("9.9.9");
  try {
    assert.throws(() => pagefindWasmNotices(root), /Pagefind 9\.9\.9 is installed, but the notices .* are for Pagefind 1\.5\.2/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("pagefindWasmNotices: the installed Pagefind is the version the notices were collected for", (t) => {
  const installed = fileURLToPath(new URL("../node_modules/pagefind/package.json", import.meta.url));
  if (!existsSync(installed)) return t.skip("node_modules not installed");
  assert.equal(JSON.parse(readFileSync(installed, "utf8")).version, wasmManifest.pagefind);
});

test("pagefindWasmNotices: every crate with its version, licence, sources and texts; GPL with its corresponding source", () => {
  const root = fakePagefind(wasmManifest.pagefind);
  try {
    const text = pagefindWasmNotices(root);
    assert.ok(text.includes("Rust crates compiled into Pagefind's search (wasm)"));
    for (const name of ["wasm-bindgen", "bit-set", "pagefind_stem", "minicbor", "pagefind_microjson", "write-json"]) {
      assert.ok(wasmManifest.crates.some((c) => c.name === name), name);
    }
    for (const c of wasmManifest.crates) {
      assert.match(c.version, /^\d+\.\d+\.\d+$/, c.name);
      assert.ok(text.includes(`--- ${c.name} ${c.version} - ${c.license}`), c.name);
      for (const f of c.files) {
        assert.ok(text.includes(`Source: ${f.source}`), f.file);
        assert.ok(text.includes(readFileSync(join(PAGEFIND_WASM_DIR, f.file), "utf8").replace(/\r\n/g, "\n").trim()), f.file);
        // a repository source names a commit, not a branch
        if (f.source.startsWith("https://github.com/")) assert.match(f.source, /\/blob\/[0-9a-f]{40}\//, f.source);
      }
    }
    const gpl = wasmManifest.crates.filter((c) => /GPL/.test(c.license));
    assert.deepEqual(gpl.map((c) => c.name), ["pagefind_microjson"]);
    for (const c of gpl) {
      assert.ok(c.files.some((f) => f.file === "GPL-3.0.txt"));
      assert.ok(c.correspondingSource?.some((s) => s.startsWith(`https://static.crates.io/crates/${c.name}/${c.name}-${c.version}.crate`)));
    }
    assert.ok(text.includes("Corresponding source: https://static.crates.io/crates/pagefind_microjson/pagefind_microjson-0.1.4.crate"));
    assert.ok(text.includes("END OF TERMS AND CONDITIONS"));
    // every vendored file is used
    const used = new Set(["manifest.json", ...wasmManifest.crates.flatMap((c) => c.files.map((f) => f.file))]);
    assert.deepEqual(readdirSync(PAGEFIND_WASM_DIR).filter((f) => !used.has(f)), []);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("bundledPackagesOf: the packages a prebuilt file inlines, from the source map beside it", () => {
  const { root, dir } = fakePackage({
    "maplibre-gl.mjs": "",
    "maplibre-gl.mjs.map": JSON.stringify({
      version: 3,
      sources: [
        "../src/ui/map.ts", // the package's own source
        "../node_modules/kdbush/index.js",
        "../node_modules/@mapbox/point-geometry/index.js",
        "../node_modules/earcut/src/earcut.js",
        "../node_modules/kdbush/index.js", // listed once
        "../node_modules/maplibre-gl/src/x.ts", // the package itself
      ],
    }),
    "no-map.mjs": "",
  });
  try {
    assert.deepEqual(bundledPackagesOf(join(dir, "maplibre-gl.mjs?url"), "maplibre-gl"), ["@mapbox/point-geometry", "earcut", "kdbush"]);
    assert.deepEqual(bundledPackagesOf(join(dir, "no-map.mjs"), "maplibre-gl"), []);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
