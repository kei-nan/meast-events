// A border's note and source as short lists (lib/boundaryText.js): the data's
// own words, one sentence or source item per bullet. Shared by the border popup
// and Borders list (MapUi.jsx, styled by MapUi.css) and PlaceHistory.jsx (its
// own classes). The list class is `${className}-list`.
import { itemParts, noteSentences, sourceItems } from "../lib/boundaryText";

// One sentence stays a paragraph.
export function BoundaryNote({ note, className }) {
  const sentences = noteSentences(note);
  if (!sentences.length) return null;
  if (sentences.length === 1) return <p className={className}>{sentences[0]}</p>;
  return (
    <ul className={`${className} ${className}-list`}>
      {sentences.map((s, i) => (
        <li key={i}>{s}</li>
      ))}
    </ul>
  );
}

// Links by a readable name (the full URL is their title).
export function BoundarySource({ source, className }) {
  const items = sourceItems(source);
  if (!items.length) return null;
  const render = (item) =>
    itemParts(item).map((p, i) =>
      p.href ? (
        <a key={i} href={p.href} target="_blank" rel="noopener noreferrer" title={p.href}>
          {p.label}
        </a>
      ) : (
        p.text
      )
    );
  if (items.length === 1) {
    return (
      <p className={className}>
        <strong>Source:</strong> {render(items[0])}
      </p>
    );
  }
  return (
    <div className={className}>
      <strong>Sources:</strong>
      <ul className={`${className}-list`}>
        {items.map((item, i) => (
          <li key={i}>{render(item)}</li>
        ))}
      </ul>
    </div>
  );
}
