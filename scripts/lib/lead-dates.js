// The dates a Wikipedia lead mentions (wikipedia_lead_dates, for the shown date-order note,
// app/src/lib/dateOrderNote.js). Shared by lib/v21.js (the pipeline), scripts/refresh-extracts.js (a new lead) and
// lib/validate.js, which must not import lib/v21.js (it pulls in the whole pipeline). Read-only on the lead.
import { yearsIn } from "./wiki.js";

const MONTHS = "January|February|March|April|May|June|July|August|September|October|November|December";
// Full dates as the lead writes them: "2 August 1990", "August 2, 1990".
export const DATE_RES = [
  new RegExp(`\\b\\d{1,2} (?:${MONTHS}) \\d{4}\\b`, "g"),
  new RegExp(`\\b(?:${MONTHS}) \\d{1,2}, \\d{4}\\b`, "g"),
];

// The same lead dates lib/v21.js's wikipedia_dates_note lists, as data for the UI's date-order note: "YYYY-MM-DD"
// dates, or "YYYY" years when the lead gives no full date, in date order. [] when the lead offers none.
export function wikipediaLeadDates(extract) {
  if (!extract) return [];
  const months = MONTHS.split("|");
  const iso = (text) => {
    const dm = /^(\d{1,2}) (\w+) (\d{4})$/.exec(text);
    const md = /^(\w+) (\d{1,2}), (\d{4})$/.exec(text);
    const [day, month, year] = dm ? [dm[1], dm[2], dm[3]] : [md[2], md[1], md[3]];
    return `${year}-${String(months.indexOf(month) + 1).padStart(2, "0")}-${day.padStart(2, "0")}`;
  };
  const full = [];
  for (const re of DATE_RES) for (const m of extract.matchAll(re)) full.push(m[0]);
  const out = full.length ? full.slice(0, 4).map(iso) : yearsIn(extract).slice(0, 6).map(String);
  return [...new Set(out)].sort();
}

// The wikipedia_lead_dates an event should carry: its lead's dates, only next to a date_order_invalid flag (the
// rule lib/v21.js finalizeEvent applies); null when it should carry none.
export function expectedLeadDates(ev) {
  const flagged = (ev.date_flags ?? []).some((f) => typeof f === "string" && f.startsWith("date_order_invalid"));
  const dates = flagged ? wikipediaLeadDates(ev.extract) : [];
  return dates.length ? dates : null;
}

// Re-derives wikipedia_lead_dates after a new lead was written (scripts/refresh-extracts.js), as refreshLeadYearFlag
// (lib/flags.js) does for its flag: the dates describe the stored lead. A new field goes right after date_flags;
// other keys keep their order. Nothing but this field changes. Returns { from, to } (null = absent) when it
// changed, else null.
export function refreshLeadDates(ev) {
  const from = ev.wikipedia_lead_dates ?? null;
  const to = expectedLeadDates(ev);
  if (JSON.stringify(from) === JSON.stringify(to)) return null;
  if (!to) delete ev.wikipedia_lead_dates;
  else if ("wikipedia_lead_dates" in ev || !("date_flags" in ev)) ev.wikipedia_lead_dates = to;
  else {
    const entries = Object.entries(ev);
    for (const [k] of entries) delete ev[k];
    for (const [k, v] of entries) {
      ev[k] = v;
      if (k === "date_flags") ev.wikipedia_lead_dates = to;
    }
  }
  return { from, to };
}
