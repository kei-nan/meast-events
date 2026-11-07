// What the panel's hidden live region (SearchPanel.jsx .sp-sr-status) says.
// Pure.
//
// Silent while Play runs (the visible status line changes every step), "Paused
// at <year>. " first when Play is paused there, otherwise the status line
// (`status`, with the years spelled out). Silent too while the events load or
// failed to load: the header's notice (App.jsx .app-search, a live region of
// its own) says "Loading events…" or that they failed, and two regions would
// announce it twice.
export function panelLiveText({ playing, pausedAtYear = null, eventsLoading = false, eventsError = false, status }) {
  if (playing || eventsLoading || eventsError) return "";
  return (pausedAtYear != null ? `Paused at ${pausedAtYear}. ` : "") + status;
}
