// Pinned sha256 of the gitignored upstream files in data/raw/ that scripts/ingest-boundaries.js
// reads. data/boundaries.json is rebuilt from them, so a different download (a new CShapes or
// Natural Earth release, a truncated or re-encoded file) would silently change the borders.
// The ingest checks each file's bytes against this list before using it and stops on a
// mismatch. A deliberate upgrade: rerun with --allow-raw-change, review the resulting
// boundaries diff, then put the new file's hash here in the same reviewed change.
//
// Hashes taken on 2026-11-08 from the files that rebuild the committed data/boundaries.json
// byte for byte (CShapes 2.0 from https://icr.ethz.ch/data/cshapes/CShapes-2.0.geojson,
// 26,344,671 bytes; Natural Earth 1:10m Admin 0 countries, 13,287,234 bytes).
import { createHash } from "node:crypto";

export const RAW_INPUT_SHA256 = {
  "cshapes-2.0.geojson": "384b1ea90b9419f30a858d7ec237c85a22c60d1b35b5f85f215a1204f9989d42",
  "ne10-countries.geojson": "239eec57ac17f100a11e2536cffc56752c318b50ae765b0918ff7aab4ce8f255",
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
      `${what}. This is not the upstream file the committed data/boundaries.json was built from. ` +
      `Restore that download, or, to upgrade the source deliberately, rerun with ${ALLOW_RAW_CHANGE_FLAG}, ` +
      "review the boundaries diff and pin the new hash in the same reviewed change.",
  };
}
