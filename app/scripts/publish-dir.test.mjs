// Tests for publish-dir.mjs: the previous versioned folder and meta.json stay
// usable until the new folder is in place, and a busy rename is retried or
// replaced by a copy.
import test from "node:test";
import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, readdir, rename, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { publishVersionedDir, renameWithRetry } from "./publish-dir.mjs";

// A root with a published v.old (and its meta.json) and a finished staging folder.
async function fixture() {
  const root = await mkdtemp(path.join(tmpdir(), "publish-dir-"));
  await mkdir(path.join(root, "v.old"));
  await writeFile(path.join(root, "v.old", "a.txt"), "old");
  await writeFile(path.join(root, "meta.json"), JSON.stringify({ version: "old", dir: "v.old" }));
  const staging = path.join(root, "staging");
  await mkdir(path.join(staging, "index"), { recursive: true });
  await writeFile(path.join(staging, "a.txt"), "new");
  await writeFile(path.join(staging, "index", "b.txt"), "chunk");
  return { root, staging };
}
const busy = (code = "EPERM") => Object.assign(new Error(`${code}: busy`), { code });
const meta = { version: "new", dir: "v.new" };

test("publishVersionedDir: moves staging into place, then points meta.json at it, then removes the old folder", async () => {
  const { root, staging } = await fixture();
  try {
    const left = await publishVersionedDir({ root, staging, dir: "v.new", meta });
    assert.deepEqual(left, []);
    assert.deepEqual((await readdir(root)).sort(), ["meta.json", "v.new"]);
    assert.equal(await readFile(path.join(root, "v.new", "a.txt"), "utf8"), "new");
    assert.equal(await readFile(path.join(root, "v.new", "index", "b.txt"), "utf8"), "chunk");
    assert.deepEqual(JSON.parse(await readFile(path.join(root, "meta.json"), "utf8")), meta);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("publishVersionedDir: a rename that keeps failing for another reason leaves the previous index and meta.json", async () => {
  const { root, staging } = await fixture();
  try {
    const fs = { rename: async () => { throw busy("ENOSPC"); } };
    await assert.rejects(publishVersionedDir({ root, staging, dir: "v.new", meta, fs }), /ENOSPC/);
    assert.equal(await readFile(path.join(root, "v.old", "a.txt"), "utf8"), "old");
    assert.deepEqual(JSON.parse(await readFile(path.join(root, "meta.json"), "utf8")), { version: "old", dir: "v.old" });
    assert.ok(!(await readdir(root)).includes("v.new"));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("publishVersionedDir: a rename Windows keeps refusing (EPERM) falls back to a copy", async () => {
  const { root, staging } = await fixture();
  try {
    let calls = 0;
    const fs = { rename: async () => { calls++; throw busy("EPERM"); } };
    const left = await publishVersionedDir({ root, staging, dir: "v.new", meta, fs });
    assert.ok(calls > 1, "retried before copying");
    assert.deepEqual(left, []);
    assert.deepEqual((await readdir(root)).sort(), ["meta.json", "v.new"]);
    assert.equal(await readFile(path.join(root, "v.new", "index", "b.txt"), "utf8"), "chunk");
    assert.deepEqual(JSON.parse(await readFile(path.join(root, "meta.json"), "utf8")), meta);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("publishVersionedDir: the same version already in place is kept and staging dropped", async () => {
  const { root, staging } = await fixture();
  try {
    await publishVersionedDir({ root, staging, dir: "v.old", meta: { version: "old", dir: "v.old" } });
    assert.deepEqual((await readdir(root)).sort(), ["meta.json", "v.old"]);
    assert.equal(await readFile(path.join(root, "v.old", "a.txt"), "utf8"), "old");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("renameWithRetry: retries a busy rename and succeeds once it is free; rethrows other errors at once", async () => {
  const { root, staging } = await fixture();
  try {
    let calls = 0;
    const flaky = { rename: async (a, b) => { if (++calls < 3) throw busy("EBUSY"); return rename(a, b); } };
    await renameWithRetry(staging, path.join(root, "moved"), { delayMs: 1, fs: flaky });
    assert.equal(calls, 3);
    assert.equal(await readFile(path.join(root, "moved", "a.txt"), "utf8"), "new");

    let other = 0;
    const broken = { rename: async () => { other++; throw busy("ENOENT"); } };
    await assert.rejects(renameWithRetry("x", "y", { delayMs: 1, fs: broken }), /ENOENT/);
    assert.equal(other, 1);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
