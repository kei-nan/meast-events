// The events an AI is given around an event it was asked about (scripts/build-ai-files.mjs,
// worker/index.js). The aim: a question asked from one side's point of view gets the same
// events as the same question asked from the other side, so the answer has to deal with
// the events the question left out. Nothing here judges a side, an event or a question;
// the set depends only on the event, by these mechanical rules:
//
//   1. Wikidata "part of" (P361) groups. Every group the event is in, directly or through
//      a parent that is itself an event here (October 7 attacks -> Gaza War -> Gaza-Israel
//      conflict), is a candidate. Of those, the widest groups with at most GROUP_MAX
//      events here are used, all of them: a narrower group is a framing of its own
//      ("October 7 attacks" and "Gaza genocide" are both groups), so it is replaced by the
//      wider group that holds it. A group wider than GROUP_MAX (Arab Spring, World War I)
//      is too broad to be one conflict, unless it is the only kind the event has: then
//      the narrowest of those is used. A Wikipedia list article ("list of modern conflicts
//      in the Middle East") is a list, not a group, and is never used.
//   2. Place and time: every event tagged with a country this one is tagged with that
//      starts within NEAR_YEARS years of it. This also covers the events Wikidata does
//      not place in any group.
//   3. The rule-1 groups of those rule-2 events (with at least VIA_MIN events), one step
//      only, so an event that Wikidata places in no group or in a different one still
//      meets the war it happened in.
//
// What it does not guarantee: identical sets for every pair of events in one conflict.
// Two events years apart reach different neighbours, so one can see the other without
// the reverse (conflictContext.test.js lists the known one-way pairs).
//
// Wikidata's labels are shown as Wikidata gives them, as in lib/partOf.js. Order is by
// start date, never by relevance: ranking by match to a question would put the events
// that agree with its framing first.

const QID = /^Q[1-9]\d*$/;
const YEAR = /^(-?\d{4})/;

// A group holding more events than this is too broad to be one conflict (rule 1).
export const GROUP_MAX = 60;
// Rule 2: same country, start years at most this far apart.
export const NEAR_YEARS = 1;
// Rule 3: a neighbour's group is added only if it holds at least this many events here.
// A neighbour tagged with many countries is in small groups that have little to do with
// this event (one 2023 event brought "2023 Turkish general election" into October 7's).
const VIA_MIN = 3;

const isList = (label) => /^list of\b/i.test(label ?? "");
const startYear = (e) => {
  const m = YEAR.exec(typeof e?.date_start === "string" ? e.date_start : "");
  return m ? Number(m[1]) : null;
};

// Oldest first; undated last; ties by id, so the order is stable.
function byStart(a, b) {
  const da = a.date_start ?? "￿";
  const db = b.date_start ?? "￿";
  if (da !== db) return da < db ? -1 : 1;
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

/** The rule in words, with its constants, for the files and tools that use it. */
export function contextRule() {
  return (
    `Chosen by a fixed rule that does not depend on the question: (1) the widest Wikidata "part of" groups ` +
    `the event belongs to that hold at most ${GROUP_MAX} events in this dataset (narrower groups are folded into the ` +
    `wider group that holds them; Wikipedia list articles are not groups); (2) every event tagged with the same ` +
    `country that starts within ${NEAR_YEARS} year${NEAR_YEARS === 1 ? "" : "s"} of it; (3) the groups of those events from ` +
    `rule 1 (with at least ${VIA_MIN} events), one step only. Listed by start date, not by relevance.`
  );
}

/**
 * `events`: [{id, title, date_start, countries, wikidata_qid?, part_of?: [{qid, label}]}].
 * Returns Map<event id, {groups: [{qid, label, id?, size}], near: {countries, years, size},
 * ids: [event id, ...]}>: `ids` is the event itself and every event the rules add, by
 * start date; `groups` are the Wikidata groups used (size: events here in the group);
 * `near` the place-and-time rule (size: the events it matched, the event included).
 */
export function resolveContext(events) {
  const byId = new Map(events.map((e) => [e.id, e]));
  const byQid = new Map();
  for (const e of events) if (QID.test(e.wikidata_qid ?? "") && !byQid.has(e.wikidata_qid)) byQid.set(e.wikidata_qid, e);

  const labels = new Map();
  const parentsOf = (e) => {
    const out = [];
    for (const p of Array.isArray(e.part_of) ? e.part_of : []) {
      if (!p || !QID.test(p.qid ?? "") || p.qid === e.wikidata_qid || out.includes(p.qid)) continue;
      if (!labels.has(p.qid)) labels.set(p.qid, typeof p.label === "string" && p.label ? p.label : p.qid);
      out.push(p.qid);
    }
    return out;
  };

  // Every group an event is in: its parents, and theirs when a parent is an event here.
  const memo = new Map();
  const groupsOf = (e, stack = new Set()) => {
    if (memo.has(e.id)) return memo.get(e.id);
    const out = new Set();
    if (stack.has(e.id)) return out; // a cycle in Wikidata's data
    stack.add(e.id);
    for (const q of parentsOf(e)) {
      out.add(q);
      const parent = byQid.get(q);
      if (parent && parent.id !== e.id) for (const g of groupsOf(parent, stack)) out.add(g);
    }
    stack.delete(e.id);
    memo.set(e.id, out);
    return out;
  };

  // Members of a group: the events in it and, when the group is an event here, that event.
  const members = new Map();
  const add = (q, id) => {
    if (!members.has(q)) members.set(q, new Set());
    members.get(q).add(id);
  };
  for (const e of events) {
    for (const q of groupsOf(e)) add(q, e.id);
    if (QID.test(e.wikidata_qid ?? "") && byQid.get(e.wikidata_qid) === e) add(e.wikidata_qid, e.id);
  }
  for (const e of events) if (byQid.get(e.wikidata_qid) === e) labels.set(e.wikidata_qid, labels.get(e.wikidata_qid) ?? e.title);

  // `big` holds every event of `small`; of two groups with the same events, the one with
  // the lower QID is kept (one of them must be, and the choice must not depend on order).
  const contains = (big, small) => {
    if (big === small) return false;
    const b = members.get(big), s = members.get(small);
    if (b.size < s.size || ![...s].every((x) => b.has(x))) return false;
    return b.size > s.size || big < small;
  };

  // Rule 1 for one event: the groups it is placed in.
  const ownGroups = (e) => {
    const all = [...groupsOf(e)].filter((q) => !isList(labels.get(q)));
    const fit = all.filter((q) => members.get(q).size <= GROUP_MAX);
    const used = fit.filter((q) => !fit.some((h) => contains(h, q)));
    if (used.length || !all.length) return used;
    const smallest = Math.min(...all.map((q) => members.get(q).size));
    return all.filter((q) => members.get(q).size === smallest);
  };
  // Rule 2 for one event: the events of its countries within NEAR_YEARS, itself included.
  const nearOf = (e) => {
    const y = startYear(e);
    const countries = Array.isArray(e.countries) ? e.countries : [];
    if (y === null || !countries.length) return [e];
    return events.filter((o) => {
      const oy = startYear(o);
      return o === e || (oy !== null && Math.abs(oy - y) <= NEAR_YEARS && (o.countries ?? []).some((c) => countries.includes(c)));
    });
  };

  const out = new Map();
  for (const e of events) {
    const near = nearOf(e);
    // Rule 3: the groups of those events too, one step (not their neighbours' neighbours).
    // Without it an event Wikidata places in no group, or in a different one, never meets
    // the war it happened in: Iran Air Flight 655 (Iran, 1988) and the Halabja massacre
    // (Iraq, 1988) would share almost nothing with the Iran-Iraq War.
    const own = ownGroups(e);
    const via = new Set(own);
    for (const o of near) for (const q of ownGroups(o)) if (members.get(q).size >= VIA_MIN) via.add(q);
    const used = [...via].sort((a, b) => members.get(b).size - members.get(a).size || (a < b ? -1 : 1));

    const ids = new Set(near.map((o) => o.id));
    for (const q of used) for (const id of members.get(q)) ids.add(id);
    out.set(e.id, {
      groups: used.map((q) => {
        const ev = byQid.get(q);
        return { qid: q, label: labels.get(q), ...(ev ? { id: ev.id } : {}), size: members.get(q).size, own: own.includes(q) };
      }),
      near: { countries: Array.isArray(e.countries) ? e.countries : [], years: NEAR_YEARS, size: near.length },
      ids: [...ids].map((id) => byId.get(id)).sort(byStart).map((x) => x.id),
    });
  }
  return out;
}
