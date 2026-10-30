// Chunks split out of the entry bundle, each with one loader: the lazy() that renders
// it and a caller that only warms it both use the same import, so the browser fetches
// it once (a dynamic import of one module is shared).

// The open event's view (components/EventDetail.jsx, with RelatedEvents, Citation and
// lib/citation.js): SearchPanel renders it lazily; App starts it at once for an event
// link, and lib/warmEvent.js as a row or event link is pointed at, each alongside the
// event's full record (dataClient prefetchFullLead).
export const loadEventDetail = () => import("../components/EventDetail.jsx");

// "What was this place?" (components/PlaceHistory.jsx, with lib/placeHistory.js):
// SearchPanel renders it lazily, when a place is opened.
export const loadPlaceHistory = () => import("../components/PlaceHistory.jsx");

// The results download (lib/exportResults.js): SearchPanel's Download menu warms it as
// it opens and awaits it on CSV or JSON.
export const loadExportResults = () => import("./exportResults.js");
