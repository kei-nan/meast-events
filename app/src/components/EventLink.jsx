import { eventPath } from "../lib/urlState.js";

// A link to another event in the app: a real link (new tab, copy link work), but a
// plain click or Enter opens it in place through the app's own selection.
export default function EventLink({ id, onSelectEvent, children, ...rest }) {
  return (
    <a
      href={eventPath(id)}
      onClick={(e) => {
        if (!onSelectEvent || e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
        e.preventDefault();
        onSelectEvent(id);
      }}
      {...rest}
    >
      {children}
    </a>
  );
}
