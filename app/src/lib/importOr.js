// For React.lazy: import a chunk, or resolve to `Fallback` if its code cannot be
// downloaded. A rejection would reach the app-wide ErrorBoundary and replace the
// whole app; the fallback keeps the failure to the part that could not load, and
// says to reload (the page then asks the host for the current chunks).
//   lazy(() => importOr(() => import("./X.jsx"), XFailed))
//
// A failed download is retried once after `delay` ms. Chrome 153 remembers a
// failed module import and rejects the retry at once without a request (checked),
// so there it only delays the message; a browser that does not remember the
// failure gets a real second try, which helps on a flaky connection.
//
// If the retry fails too, the page reloads itself ONCE (reloadOnce below) before
// the fallback is shown. The usual cause is a deploy: a tab opened before it asks
// for the old build's chunks, which the host no longer has (every deploy replaces
// all of /assets/), and only a reload gets the new page and its chunks.
//
// Any other error (the module threw while running, a bad build) is not a
// download failure: it is rethrown, so it reaches the ErrorBoundary and the
// console instead of being shown as "please reload".
export function importOr(load, Fallback, { delay = 1500, reload = reloadOnce, grace = RELOAD_GRACE_MS } = {}) {
  return load()
    .catch((err) => {
      if (!isLoadFailure(err)) throw err;
      return wait(delay).then(load);
    })
    .catch(async (err) => {
      if (!isLoadFailure(err)) throw err;
      // While the reload starts, keep the Suspense placeholder rather than flash
      // "please reload"; the fallback still comes if the page somehow stays.
      if (await reload()) await wait(grace);
      return { default: Fallback };
    });
}

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const RELOAD_GRACE_MS = 10_000;

// The error each engine gives when a dynamic import's module (or one it imports)
// cannot be fetched: a TypeError, Chromium "Failed to fetch dynamically imported
// module: <url>", Firefox "error loading dynamically imported module: <url>",
// Safari "Importing a module script failed.". Also Vite's own Error when a chunk's
// stylesheet cannot be loaded: Vite's preload helper loads a lazy chunk's CSS
// before importing it (MapView, AboutData) and rejects with "Unable to preload
// CSS for <url>", so after a deploy that is the error a stale tab sees first.
export function isLoadFailure(err) {
  if (err instanceof TypeError) return /dynamically imported module|importing a module script failed/i.test(err.message);
  return err instanceof Error && /^Unable to preload CSS for /.test(err.message);
}

// sessionStorage key: when this tab last reloaded itself for a failed chunk.
export const RELOAD_KEY = "chunk-reload-at";
// A second failure within this long of a self-reload means the reload did not
// help (the host still serves a page naming missing chunks, or the chunk is
// broken): no further reload, the fallback says so instead. Long enough to cover
// the reload itself on a slow connection and the lazy load that follows it.
export const RELOAD_WINDOW_MS = 60_000;

// Records a reload at `now` in `storage` unless one was recorded within
// `windowMs`. Returns whether the caller may reload. If storage cannot be read
// or written (blocked, full, a private mode that throws), there is no way to
// tell a second attempt from the first, so no reload: that is what keeps a
// failure that survives reloads from becoming a reload loop.
export function claimReload(storage, now, windowMs = RELOAD_WINDOW_MS) {
  try {
    const last = Number(storage.getItem(RELOAD_KEY));
    if (last && now >= last && now - last < windowMs) return false;
    storage.setItem(RELOAD_KEY, String(now));
    return storage.getItem(RELOAD_KEY) === String(now);
  } catch {
    return false;
  }
}

// Reloads the page once (claimReload) when the host answers for it; returns
// whether it did. Offline, a reload would swap the app for the browser's error
// page, so the page is asked for first (HEAD, not from cache) and kept if that
// fails. The reload keeps location.href, which holds the view (lib/urlState.js):
// an event or the About dialog is written to the URL at once, while other changes
// wait 400 ms (hooks/useUrlState.js), so only a change made in the last 400 ms
// before the reload (at least `delay` after the failed import) can be lost.
export async function reloadOnce({
  storage = sessionStore(),
  now = Date.now,
  reachable = pageReachable,
  go = () => window.location.reload(),
} = {}) {
  if (!(await reachable())) return false;
  if (!claimReload(storage, now())) return false;
  go();
  return true;
}

function sessionStore() {
  try {
    return window.sessionStorage;
  } catch {
    return null; // claimReload then refuses
  }
}

async function pageReachable() {
  try {
    const res = await fetch(window.location.href, { method: "HEAD", cache: "no-store" });
    return res.ok;
  } catch {
    return false;
  }
}
