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
// Any other error (the module threw while running, a bad build) is not a
// download failure: it is rethrown, so it reaches the ErrorBoundary and the
// console instead of being shown as "please reload".
export function importOr(load, Fallback, { delay = 1500 } = {}) {
  return load()
    .catch((err) => {
      if (!isLoadFailure(err)) throw err;
      return new Promise((resolve) => setTimeout(resolve, delay)).then(load);
    })
    .catch((err) => {
      if (!isLoadFailure(err)) throw err;
      return { default: Fallback };
    });
}

// The TypeError each engine gives when a dynamic import's module (or one it
// imports) cannot be fetched: Chromium "Failed to fetch dynamically imported
// module: <url>", Firefox "error loading dynamically imported module: <url>",
// Safari "Importing a module script failed.".
export function isLoadFailure(err) {
  return err instanceof TypeError && /dynamically imported module|importing a module script failed/i.test(err.message);
}
