import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { readJsonIfExists, writeFileAtomic, writeFileAtomicSync } from "./files.js";

const withDir = async (fn) => {
  const dir = mkdtempSync(join(tmpdir(), "files-test-"));
  try {
    await fn(dir);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
};

test("readJsonIfExists: parses the file; a missing file gives the fallback", () =>
  withDir(async (dir) => {
    const f = join(dir, "a.json");
    assert.deepEqual(await readJsonIfExists(f, []), []);
    writeFileSync(f, '[{"id":"x"}]');
    assert.deepEqual(await readJsonIfExists(f, []), [{ id: "x" }]);
    assert.deepEqual(await readJsonIfExists(pathToFileURL(f), []), [{ id: "x" }]);
  }));

test("readJsonIfExists: malformed JSON or an unreadable path throws, never the fallback", () =>
  withDir(async (dir) => {
    const f = join(dir, "bad.json");
    writeFileSync(f, '[{"id":');
    await assert.rejects(readJsonIfExists(f, []), /bad\.json is not valid JSON/);
    writeFileSync(f, "");
    await assert.rejects(readJsonIfExists(f, []), /not valid JSON/);
    const sub = join(dir, "a-directory");
    mkdirSync(sub);
    await assert.rejects(readJsonIfExists(sub, []), (err) => err.code === "EISDIR");
  }));

test("writeFileAtomic / writeFileAtomicSync: replace the file whole, no temporary file left", () =>
  withDir(async (dir) => {
    const f = join(dir, "events.json");
    writeFileSync(f, "old");
    await writeFileAtomic(f, "new\n");
    assert.equal(readFileSync(f, "utf-8"), "new\n");
    await writeFileAtomic(pathToFileURL(f), "url\n");
    assert.equal(readFileSync(f, "utf-8"), "url\n");
    writeFileAtomicSync(f, "sync\n");
    assert.equal(readFileSync(f, "utf-8"), "sync\n");
    assert.deepEqual(readdirSync(dir), ["events.json"]);
  }));

test("writeFileAtomic: a failed write leaves the old file and no temporary file", () =>
  withDir(async (dir) => {
    const f = join(dir, "events.json");
    writeFileSync(f, "old");
    // The target is a directory with content: the rename fails, after the temporary file was written.
    const target = join(dir, "busy");
    mkdirSync(target);
    writeFileSync(join(target, "x"), "");
    await assert.rejects(writeFileAtomic(target, "new"));
    assert.throws(() => writeFileAtomicSync(target, "new"));
    assert.equal(readFileSync(f, "utf-8"), "old");
    assert.deepEqual(readdirSync(dir).sort(), ["busy", "events.json"]);
  }));
