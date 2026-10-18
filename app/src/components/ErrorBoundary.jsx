import { Component } from "react";

// Wraps the whole app (src/main.jsx). Without it, an error thrown while
// rendering (a malformed record, a lazy chunk that failed to download, a bug)
// makes React unmount everything and the visitor sees an empty page. With it,
// they get a way back: a reload; the map from the start (when the error comes
// from a link to an event or a view, reloading it fails again); or the plain
// list of every event (/event/), which needs no JavaScript. React logs the
// error itself, so nothing is logged here.
export default class ErrorBoundary extends Component {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  render() {
    if (!this.state.failed) return this.props.children;
    return (
      <main className="app-error" role="alert">
        <h1>Something went wrong</h1>
        <p>The page stopped working because of an error.</p>
        <p>
          <button type="button" onClick={() => window.location.reload()}>
            Reload the page
          </button>
        </p>
        <p>
          If it happens again, <a href="/">open the map from the start</a> or browse{" "}
          <a href="/event/">the list of all events</a>.
        </p>
      </main>
    );
  }
}
