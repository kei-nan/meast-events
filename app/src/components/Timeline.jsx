const MIN_YEAR = 1900;
const MAX_YEAR = 2026;

export default function Timeline({ startYear, endYear, onChangeRange, eventCountsByYear }) {
  const maxCount = Math.max(1, ...Object.values(eventCountsByYear));

  function handleStartChange(value) {
    const next = Math.min(Number(value), endYear);
    onChangeRange(next, endYear);
  }

  function handleEndChange(value) {
    const next = Math.max(Number(value), startYear);
    onChangeRange(startYear, next);
  }

  return (
    <div className="timeline">
      <div className="timeline-header">
        <span className="timeline-year">
          {startYear === endYear ? startYear : `${startYear} – ${endYear}`}
        </span>
      </div>
      <div className="timeline-density">
        {Array.from({ length: MAX_YEAR - MIN_YEAR + 1 }, (_, i) => MIN_YEAR + i).map((y) => (
          <div
            key={y}
            className={
              "timeline-tick" + (y >= startYear && y <= endYear ? " timeline-tick--active" : "")
            }
            style={{ height: `${4 + 16 * ((eventCountsByYear[y] ?? 0) / maxCount)}px` }}
          />
        ))}
      </div>
      <div className="timeline-range">
        <div className="timeline-track" />
        <div
          className="timeline-track-fill"
          style={{
            left: `${((startYear - MIN_YEAR) / (MAX_YEAR - MIN_YEAR)) * 100}%`,
            right: `${100 - ((endYear - MIN_YEAR) / (MAX_YEAR - MIN_YEAR)) * 100}%`,
          }}
        />
        <input
          type="range"
          min={MIN_YEAR}
          max={MAX_YEAR}
          value={startYear}
          onChange={(e) => handleStartChange(e.target.value)}
          className="timeline-slider timeline-slider--start"
        />
        <input
          type="range"
          min={MIN_YEAR}
          max={MAX_YEAR}
          value={endYear}
          onChange={(e) => handleEndChange(e.target.value)}
          className="timeline-slider timeline-slider--end"
        />
      </div>
      <div className="timeline-bounds">
        <span>{MIN_YEAR}</span>
        <span>Borders shown reflect the end year. Events shown span the whole range.</span>
        <span>{MAX_YEAR}</span>
      </div>
    </div>
  );
}

export { MIN_YEAR, MAX_YEAR };
