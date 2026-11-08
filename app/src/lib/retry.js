// One automatic retry for the map's data loads (MapView land, hooks/useBoundaryDecades.js).

const RETRY_DELAY_MS = 1500;

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// One automatic retry with backoff. onFirstFail lets the UI show a notice
// while the retry is pending.
export async function withRetry(fn, onFirstFail) {
  try {
    return await fn();
  } catch (err) {
    onFirstFail?.(err);
    await sleep(RETRY_DELAY_MS);
    return fn();
  }
}
