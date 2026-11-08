import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { checkRawInput, sha256, RAW_INPUT_SHA256, ALLOW_RAW_CHANGE_FLAG } from "./raw-inputs.js";

const bytes = Buffer.from('{"type":"FeatureCollection","features":[]}');
const pins = { "cshapes-2.0.geojson": sha256(bytes) };

test("checkRawInput: the pinned bytes pass", () => {
  assert.deepEqual(checkRawInput("cshapes-2.0.geojson", bytes, { pins }), { ok: true, actual: sha256(bytes), message: null });
});

test("checkRawInput: other bytes fail with both hashes and the override flag named", () => {
  const changed = Buffer.from('{"type":"FeatureCollection","features":[] }');
  const r = checkRawInput("cshapes-2.0.geojson", changed, { pins });
  assert.equal(r.ok, false);
  assert.ok(r.message.includes(sha256(changed)) && r.message.includes(pins["cshapes-2.0.geojson"]));
  assert.match(r.message, /^data\/raw\/cshapes-2\.0\.geojson has sha256 [0-9a-f]{64}, but [0-9a-f]{64} is pinned/);
  assert.ok(r.message.includes(ALLOW_RAW_CHANGE_FLAG));
  // The override lets it through, as a warning.
  const allowed = checkRawInput("cshapes-2.0.geojson", changed, { pins, allow: true });
  assert.equal(allowed.ok, true);
  assert.match(allowed.message, /continuing because of --allow-raw-change$/);
});

test("checkRawInput: a file with no pinned hash fails, saying so", () => {
  const r = checkRawInput("ne10-countries.geojson", bytes, { pins });
  assert.equal(r.ok, false);
  assert.match(r.message, /has no pinned hash yet/);
  assert.equal(checkRawInput("ne10-countries.geojson", bytes, { pins, allow: true }).ok, true);
});

test("RAW_INPUT_SHA256: every data/raw/ file the boundary ingest and the correction geometry read is pinned", () => {
  assert.deepEqual(Object.keys(RAW_INPUT_SHA256).sort(), [
    "cshapes-2.0.geojson",
    "ne10-admin1.geojson",
    "ne10-countries.geojson",
    "ne10-minor-islands.geojson",
    "oslo-agreement/OsloAgreement.dbf",
    "oslo-agreement/OsloAgreement.shp",
  ]);
  for (const h of Object.values(RAW_INPUT_SHA256)) assert.match(h, /^[0-9a-f]{64}$/);
});

test("the two scripts read data/raw/ only through the pinned check", () => {
  for (const script of ["ingest-boundaries.js", "extract-correction-geometry.js"]) {
    const src = readFileSync(new URL(`../${script}`, import.meta.url), "utf8");
    // Every raw file named in code (not in comments: the download commands) goes through the check.
    const code = src
      .split("\n")
      .filter((l) => !l.trim().startsWith("//"))
      .join("\n");
    const named = [...code.matchAll(/["'`]([\w./-]+\.(?:geojson|shp|dbf))["'`]/g)].map((m) => m[1]);
    assert.ok(named.length > 0, `${script} names its raw files`);
    for (const n of named) assert.ok(Object.hasOwn(RAW_INPUT_SHA256, n), `${script}: ${n} is pinned`);
    // A literal path into data/raw/ (the helpers build theirs from a checked name: `${name}`).
    assert.doesNotMatch(code, /new URL\(["'`]\.\.\/data\/raw\/[^"'`$]+["'`]/, `${script} opens no data/raw/ file directly`);
  }
});
