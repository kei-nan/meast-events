import { Component } from "react";

// Wraps the whole app (src/main.jsx). Without it, an error thrown while
// rendering (a malformed record, a lazy chunk that failed to download, a bug)
// makes React unmount everything and the visitor sees an empty page. With it,
// they get a way back: a reload, or the static event pages (/event/), which
// need no JavaScript. React logs the error itself, so nothing is logged here.
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
          </button>{" "}
          or browse <a href="/event/">all events as plain pages</a>.
        </p>
      </main>
    );
  }
}
