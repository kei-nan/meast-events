// For React.lazy: import a chunk, or resolve to `Fallback` if its download fails.
// A rejection would reach the app-wide ErrorBoundary and replace the whole app;
// the fallback keeps the failure to the part that could not load, and says to
// reload (the page then asks the host for the current chunks).
//   lazy(() => importOr(() => import("./X.jsx"), XFailed))
// No retry: browsers remember a failed module import, so importing the same URL
// again rejects at once without a new request (checked in Chrome 153), and after
// a deploy the old chunk is gone from the host anyway.
export function importOr(load, Fallback) {
  return load().catch(() => ({ default: Fallback }));
}
