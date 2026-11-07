// What the panel's hidden live region (SearchPanel.jsx .sp-sr-status) says.
// Pure.
//
// Silent while Play runs (the visible status line changes every step), "Paused
// at <year>. " first when Play is paused there, otherwise the status line
// (`status`, with the years spelled out). Silent too while the events failed to
// load: the header's notice (App.jsx .app-search, a live region of its own) says
// so, and two regions would announce it twice.
export function panelLiveText({ playing, pausedAtYear = null, eventsError = false, status }) {
  if (playing || eventsError) return "";
  return (pausedAtYear != null ? `Paused at ${pausedAtYear}. ` : "") + status;
}
