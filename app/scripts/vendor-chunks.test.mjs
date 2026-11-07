import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { VENDOR_CHUNKS } from "../vendorChunks.js";

// MapLibre and React are chunks of their own, so their file names (content
// hashes) survive a deploy that changes only the app's code. vendorChunks.js is
// imported on its own: importing vite.config.js needs a built search index
// (searchDir), which the unit tests run without.
const groupOf = (id) => VENDOR_CHUNKS.find((g) => g.test.test(id))?.name ?? null;

test("vite.config.js hands the vendor groups to the build", () => {
  const config = readFileSync(new URL("../vite.config.js", import.meta.url), "utf8");
  assert.match(config, /^import \{ VENDOR_CHUNKS \} from '\.\/vendorChunks\.js'$/m);
  assert.match(config, /rolldownOptions:\s*\{\s*output:\s*\{\s*codeSplitting:\s*\{\s*groups:\s*VENDOR_CHUNKS\s*\}/);
});

test("the build puts MapLibre and React in vendor chunks of their own", () => {
  // The package's "import" entry (maplibre-gl 6) and its shared module.
  assert.equal(groupOf("C:\\a\\app\\node_modules\\maplibre-gl\\dist\\maplibre-gl.mjs"), "maplibre");
  assert.equal(groupOf("/a/app/node_modules/maplibre-gl/dist/maplibre-gl-shared.mjs"), "maplibre");
  assert.equal(groupOf("/a/app/node_modules/react-dom/cjs/react-dom-client.production.js"), "react");
  assert.equal(groupOf("/a/app/node_modules/react/jsx-runtime.js"), "react");
  assert.equal(groupOf("/a/app/node_modules/scheduler/index.js"), "react");
});

test("stylesheets and other packages stay where they were", () => {
  assert.equal(groupOf("/a/app/node_modules/maplibre-gl/dist/maplibre-gl.css"), null);
  // The worker is a file of its own, imported by URL.
  assert.equal(groupOf("/a/app/node_modules/maplibre-gl/dist/maplibre-gl-worker.mjs?url"), null);
  assert.equal(groupOf("/a/app/node_modules/react-something-else/index.js"), null);
  assert.equal(groupOf("/a/app/src/components/MapView.jsx"), null);
});
