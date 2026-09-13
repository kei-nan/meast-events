export default function EventDetail({ event, onClose }) {
  if (!event) {
    return (
      <div className="event-detail event-detail--empty">
        <p>Select a marker on the map, or scrub the timeline, to see events here.</p>
      </div>
    );
  }

  const yearRange = event.date_end && event.date_end.slice(0, 4) !== event.date_start.slice(0, 4)
    ? `${event.date_start.slice(0, 4)}–${event.date_end.slice(0, 4)}`
    : event.date_start.slice(0, 4);

  return (
    <div className="event-detail">
      <button className="event-detail-close" onClick={onClose}>close</button>
      <span className="event-detail-category">{event.category}</span>
      <h2>{event.title}</h2>
      <p className="event-detail-meta">
        {yearRange} · {event.countries.join(", ")}
      </p>
      <p className="event-detail-extract">{event.extract ?? "No summary available."}</p>
      {event.coordinate_source?.startsWith("country-fallback") && (
        <p className="event-detail-note">
          Marker placed at a national capital as an approximate location — this event
          isn't tied to a single physical site.
        </p>
      )}
      {event.wikipedia_url && (
        <a href={event.wikipedia_url} target="_blank" rel="noreferrer">
          Read more on Wikipedia →
        </a>
      )}
      <p className="event-detail-attribution">
        Summary from Wikipedia, CC BY-SA 4.0.
      </p>
    </div>
  );
}
