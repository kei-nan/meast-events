import { useMemo, useState } from "react";
import MapView from "./components/MapView";
import Timeline, { MIN_YEAR, MAX_YEAR } from "./components/Timeline";
import EventDetail from "./components/EventDetail";
import allEvents from "./data/events.json";
import "./App.css";

function eventYearRange(e) {
  const start = Number(e.date_start.slice(0, 4));
  const end = e.date_end ? Number(e.date_end.slice(0, 4)) : start;
  return [start, end];
}

export default function App() {
  const [startYear, setStartYear] = useState(MIN_YEAR);
  const [endYear, setEndYear] = useState(MAX_YEAR);
  const [selectedEventId, setSelectedEventId] = useState(null);

  const visibleEvents = useMemo(
    () =>
      allEvents.filter((e) => {
        const [eStart, eEnd] = eventYearRange(e);
        return eStart <= endYear && eEnd >= startYear;
      }),
    [startYear, endYear]
  );

  const eventCountsByYear = useMemo(() => {
    const counts = {};
    for (const e of allEvents) {
      const [eStart] = eventYearRange(e);
      counts[eStart] = (counts[eStart] ?? 0) + 1;
    }
    return counts;
  }, []);

  const selectedEvent = allEvents.find((e) => e.id === selectedEventId) ?? null;

  function handleChangeRange(nextStart, nextEnd) {
    setStartYear(nextStart);
    setEndYear(nextEnd);
  }

  return (
    <div className="app">
      <header className="app-header">
        <h1>Middle East, 1900–present</h1>
        <p>A map and timeline of major regional events, sourced from Wikipedia.</p>
      </header>
      <div className="app-body">
        <MapView
          events={visibleEvents}
          year={endYear}
          onSelectEvent={setSelectedEventId}
          selectedEventId={selectedEventId}
        />
        <EventDetail event={selectedEvent} onClose={() => setSelectedEventId(null)} />
      </div>
      <Timeline
        startYear={startYear}
        endYear={endYear}
        onChangeRange={handleChangeRange}
        eventCountsByYear={eventCountsByYear}
      />
      <footer className="app-footer">
        Event summaries from Wikipedia (CC BY-SA 4.0). Borders adapted from{" "}
        <a href="https://icr.ethz.ch/data/cshapes/" target="_blank" rel="noreferrer">
          CShapes 2.0
        </a>{" "}
        (Schvitz et al., ETH Zurich, CC BY-NC-SA 4.0) — non-commercial use only —{" "}
        <strong>with corrections and additions by this project</strong>; every changed
        or added shape cites its own source (see <code>scripts/boundary-corrections.js</code>).
        Dashed borders mark territory under a mandate, occupation, unrecognized
        annexation, or a since-resolved sovereignty dispute.
      </footer>
    </div>
  );
}
