// Pinned sha256 of the gitignored upstream files in data/raw/ that scripts/ingest-boundaries.js
// and scripts/extract-correction-geometry.js read. data/boundaries.json and
// data/corrections-geometry.json are rebuilt from them, so a different download (a new CShapes
// or Natural Earth release, a truncated or re-encoded file) would silently change the borders.
// Both scripts check each file's bytes against this list before using it and stop on a
// mismatch. A deliberate upgrade: rerun with --allow-raw-change, review the resulting diff,
// then put the new file's hash here in the same reviewed change.
//
// Hashes taken on 2026-11-08 from the files that rebuild the committed data/boundaries.json
// and data/corrections-geometry.json byte for byte: CShapes 2.0 from
// https://icr.ethz.ch/data/cshapes/CShapes-2.0.geojson (26,344,671 bytes); Natural Earth
// 1:10m Admin 0 countries (13,287,234 bytes), Admin 1 states and provinces (40,726,851) and
// minor islands (1,320,514); the OCHA oPt Oslo Agreement areas shapefile (.shp 2,284,872,
// .dbf 874). Download commands: the header of scripts/extract-correction-geometry.js.
import { createHash } from "node:crypto";

export const RAW_INPUT_SHA256 = {
  "cshapes-2.0.geojson": "384b1ea90b9419f30a858d7ec237c85a22c60d1b35b5f85f215a1204f9989d42",
  "ne10-countries.geojson": "239eec57ac17f100a11e2536cffc56752c318b50ae765b0918ff7aab4ce8f255",
  "ne10-admin1.geojson": "22d0e3ad85eb3e27f17cabf8ba2d50e554fbc27a87796ff891d958185da62fb5",
  "ne10-minor-islands.geojson": "8c933ca7a4760256bdc46408355706e39764b0fa01c160c28888b90b4faec29f",
  "oslo-agreement/OsloAgreement.shp": "79bcf125a1b2feb177af90523ccbbfffc1462c6996da163db6dc28216532e435",
  "oslo-agreement/OsloAgreement.dbf": "ce37c996b9ba69bfae0f336fe59417dec9871f12598896bc0f75571bbea28880",
};

export const ALLOW_RAW_CHANGE_FLAG = "--allow-raw-change";

export const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");

// Checks `bytes` (the file's contents) against the pinned hash for `name`. Returns
// { ok, message }: ok is false on a mismatch or a file with no pinned hash, unless `allow`
// (the override flag) is set, when the message is a warning to print instead.
export function checkRawInput(name, bytes, { allow = false, pins = RAW_INPUT_SHA256 } = {}) {
  const actual = sha256(bytes);
  const expected = pins[name];
  if (expected === actual) return { ok: true, actual, message: null };
  const what = expected
    ? `data/raw/${name} has sha256 ${actual}, but ${expected} is pinned in scripts/lib/raw-inputs.js`
    : `data/raw/${name} has no pinned hash yet in scripts/lib/raw-inputs.js (its sha256 is ${actual})`;
  if (allow) return { ok: true, actual, message: `${what}; continuing because of ${ALLOW_RAW_CHANGE_FLAG}` };
  return {
    ok: false,
    actual,
    message:
      `${what}. This is not the upstream file the committed border data was built from. ` +
      `Restore that download, or, to upgrade the source deliberately, rerun with ${ALLOW_RAW_CHANGE_FLAG}, ` +
      "review the resulting diff and pin the new hash in the same reviewed change.",
  };
}

// For a script's command line: checkRawInput, then exit 1 with its message on a failure (a
// warning is printed and the run goes on). Returns the bytes.
export function requireRawInput(name, bytes, { allow = process.argv.includes(ALLOW_RAW_CHANGE_FLAG) } = {}) {
  const r = checkRawInput(name, bytes, { allow });
  if (!r.ok) {
    console.error(`FAIL ${r.message}`);
    process.exit(1);
  }
  if (r.message) console.warn(`warn ${r.message}`);
  return bytes;
}
