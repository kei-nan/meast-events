// One Escape press does one thing. A control that handles Escape itself (the
// search box, the year editor, an open event's Back, the About dialog) calls
// preventDefault; the window-wide handlers (the map's draw mode, popups and
// menus) act only on an Escape that is still unhandled and was not pressed in a
// form field, in a dialog or in the side panel, all of which own their Escape.
// `own` is the handler's own element: a press inside it is always its own.

const FIELD = "input, textarea, select, [contenteditable='true'], [contenteditable='']";
const OWNS_ESCAPE = "dialog[open], [role='dialog'], .side-panel";

/** True when a window keydown handler should act on this Escape (and call preventDefault). */
export function isUnhandledEscape(e, own = null) {
  if (e.key !== "Escape" || e.defaultPrevented) return false;
  const t = e.target;
  if (!t || typeof t.closest !== "function") return true; // window or document: nothing focused
  if (own?.contains?.(t)) return true;
  return !t.closest(FIELD) && !t.closest(OWNS_ESCAPE);
}
