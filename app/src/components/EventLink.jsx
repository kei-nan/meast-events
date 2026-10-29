import { eventPath } from "../lib/urlState.js";
import { warmEvent } from "../lib/warmEvent.js";

// A link to another event in the app: a real link (new tab, copy link work), but a
// plain click or Enter opens it in place through the app's own selection. Then
// pointing at, focusing or pressing it starts that event's downloads (lib/warmEvent.js).
export default function EventLink({ id, onSelectEvent, onPointerEnter, onFocus, onPointerDown, children, ...rest }) {
  const warm = (handler) => (e) => {
    handler?.(e);
    if (onSelectEvent) warmEvent(id);
  };
  return (
    <a
      href={eventPath(id)}
      onClick={(e) => {
        if (!onSelectEvent || e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
        e.preventDefault();
        onSelectEvent(id);
      }}
      onPointerEnter={warm(onPointerEnter)}
      onFocus={warm(onFocus)}
      onPointerDown={warm(onPointerDown)}
      {...rest}
    >
      {children}
    </a>
  );
}
