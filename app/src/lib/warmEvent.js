import { prefetchFullLead } from "./dataClient.js";
import { loadEventDetail } from "./lazyChunks.js";

// Warms what opening an event waits on - its full record (dataClient
// prefetchFullLead) and the code of the view that shows it (lazyChunks) - as
// soon as the person shows intent: a list row or event link pointed at, focused
// or pressed. Both are shared with the real load, so nothing downloads twice.
export function warmEvent(id) {
  prefetchFullLead(id);
  loadEventDetail().catch(() => {}); // SearchPanel's lazy() retries and reports a failure
}
