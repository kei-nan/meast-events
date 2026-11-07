// Moves a finished staging folder into place as a versioned folder next to it
// (root/v.<version>), points root/meta.json at it, and only then removes the
// other versioned folders. Used by build-search-index.mjs for public/pagefind/.
//
// The order matters because something may be reading root while this runs: a
// Vite dev server serves public/ and watches it, and a second build may start.
// The old script emptied root first and renamed staging into place after; when
// that rename failed (Windows refused it with EPERM while a dev server watched
// public/), there was no index left at all and both `npm run dev` and `npm run
// build` stopped at vite.config.js's "no search folder" check. Here, until the
// new folder is in place and meta.json names it, root keeps the previous folder
// and meta.json, so a failure at any step leaves the previous index usable.
//
// Windows refuses a rename for a moment while another process (a watcher, an
// indexer, antivirus) has a file in the folder open: EPERM, EBUSY or EACCES. The
// rename is retried with a growing pause (as fs.rm's maxRetries does, and as
// subset-fonts.mjs does per file); if it still fails, the folder is copied
// instead and staging removed afterwards.
import { cp, readdir, rename, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";

const BUSY = new Set(["EPERM", "EBUSY", "EACCES"]);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// rename(from, to), retried while Windows reports the folder busy. `fs` is
// injectable for tests.
export async function renameWithRetry(from, to, { retries = 8, delayMs = 50, fs = { rename } } = {}) {
  for (let attempt = 0; ; attempt++) {
    try {
      return await fs.rename(from, to);
    } catch (err) {
      if (attempt >= retries || !BUSY.has(err.code)) throw err;
      await sleep(delayMs * (attempt + 1));
    }
  }
}

const exists = (p) => stat(p).then(() => true, () => false);

// Publishes `staging` (a folder inside `root`) as root/<dir> and writes
// root/meta.json = meta. Returns the names of the old versioned folders it
// could not remove (left for the next run; check-dist.mjs fails a build that
// ships more than one). `fs.rename` (the folder's rename only) is injectable
// for tests.
export async function publishVersionedDir({ root, staging, dir, meta, fs = { rename } }) {
  const target = path.join(root, dir);
  if (await exists(target)) {
    // The same version is already there: <dir> is a hash of every file, so its
    // contents are these. Keep it (a rename onto a non-empty folder fails anyway).
    await rm(staging, { recursive: true, force: true, maxRetries: 5 });
  } else {
    try {
      await renameWithRetry(staging, target, { fs });
    } catch (err) {
      if (!BUSY.has(err.code)) throw err;
      // Still busy: copy instead. A failed copy is removed so no half folder
      // is left under a version name.
      try {
        await cp(staging, target, { recursive: true, errorOnExist: true, force: false });
      } catch (copyErr) {
        await rm(target, { recursive: true, force: true, maxRetries: 5 }).catch(() => {});
        throw copyErr;
      }
      await rm(staging, { recursive: true, force: true, maxRetries: 5 }).catch(() => {});
    }
  }
  // Written to a temporary name and renamed, so a reader never sees half a file.
  const metaTmp = path.join(root, `meta.json.tmp-${process.pid}`);
  await writeFile(metaTmp, JSON.stringify(meta));
  await renameWithRetry(metaTmp, path.join(root, "meta.json"));

  const left = [];
  for (const e of await readdir(root, { withFileTypes: true })) {
    if (!e.isDirectory() || !/^v\./.test(e.name) || e.name === dir) continue;
    try {
      await rm(path.join(root, e.name), { recursive: true, force: true, maxRetries: 5 });
    } catch {
      left.push(e.name);
    }
  }
  return left;
}
