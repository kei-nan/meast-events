// Small file helpers for the data scripts.
//
// writeFileAtomic / writeFileAtomicSync: write to a temporary file next to the target, then
// rename it over the target. A run killed mid-write (Ctrl-C, a CI timeout, a full disk) leaves
// the old file whole instead of a truncated data/events.json; the rename replaces the file in
// one step on the same volume.
//
// readJsonIfExists: parse a JSON file, or return `fallback` when the file does not exist. Any
// other failure (malformed JSON, a permission error) throws: a broken file must never be read
// as an empty one.
import { renameSync, rmSync, writeFileSync } from "node:fs";
import { readFile, rename, rm, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const toPath = (file) => (file instanceof URL ? fileURLToPath(file) : String(file));
const tmpName = (path) => `${path}.${process.pid}.tmp`;

export async function writeFileAtomic(file, text) {
  const path = toPath(file);
  const tmp = tmpName(path);
  try {
    await writeFile(tmp, text);
    await rename(tmp, path);
  } catch (err) {
    await rm(tmp, { force: true });
    throw err;
  }
}

export function writeFileAtomicSync(file, text) {
  const path = toPath(file);
  const tmp = tmpName(path);
  try {
    writeFileSync(tmp, text);
    renameSync(tmp, path);
  } catch (err) {
    rmSync(tmp, { force: true });
    throw err;
  }
}

export const isMissingFile = (err) => err?.code === "ENOENT";

export async function readJsonIfExists(file, fallback) {
  let text;
  try {
    text = await readFile(file, "utf-8");
  } catch (err) {
    if (isMissingFile(err)) return fallback;
    throw err;
  }
  try {
    return JSON.parse(text);
  } catch (err) {
    throw new Error(`${toPath(file)} is not valid JSON: ${err.message}`, { cause: err });
  }
}
