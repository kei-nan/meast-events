import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { bundledPackagesOf, packageNotice, packageOf } from "./third-party-licenses.mjs";

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
