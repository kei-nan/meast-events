# Data policy

This project shows Wikipedia and Wikidata content **as-is**. Wikipedia has its own biases; the project's
principle is minimal interference with it, so that any bias visible on the site is Wikipedia's, in the open,
rather than a second layer of ours. Concretely:

- We **never rewrite** titles, extracts, dates, countries, or labels. `title`, `extract`, `date_start`, `date_end`,
  `countries` and `wikidata_classes` are copied from Wikipedia/Wikidata as returned. The only change made to text is
  whitespace normalisation of the extract (see "Extract"). The exception is the hand-picked seed list: the dates and
  countries of those 102 events were typed by hand for it (on 2026-10-24, 24 of the 60 seed events the rule also finds had
  other countries than Wikidata's, and 30 seed start dates were none of the item's Wikidata P585/P580 values, 11 of them
  checked against the article, `docs/data-fixes.md` F14). They are kept as they are; each such event says so on the site
  ("Hand-picked event: ... its dates and countries were typed by hand for that list, so they can differ from Wikidata's").
- Automated checks only **flag** (a note in `review_reasons` or `date_flags`); they never overwrite, "correct" or
  silently drop an event on judgement of its content. The exceptions are the few individually verified fixes listed
  with evidence in `docs/data-fixes.md`.
- There is **no per-event editorial decision about content or inclusion**. What is included follows from the published rule below.
- We never invent coordinates and never edit Wikipedia or Wikidata.
- In addition, the project publishes a **separately labelled framing review** of each summary (`data/framing-review.json`: two separate
  reviews per summary, a labelled overall-fairness judgement of emphasis and omissions, and a wording check that quotes wording
  departing from Wikipedia's own neutrality and wording guidelines and names the guideline), produced by an AI model with the published method in
  `docs/framing-review.md`. There is no score and no verdict on which side a summary favours. It is our reading, not Wikipedia's and
  not a correction. It never alters, hides or reorders the extract, it is shown for every event (including those where nothing was
  found), and readers can contest it; re-reviews are recorded in the file's history. This is the one per-event judgement the project
  makes, and it is kept out of every Wikipedia/Wikidata field.

## What each field is

| Field | Content | Whose |
|---|---|---|
| `title`, `wikipedia_url` | English Wikipedia article title / URL | Wikipedia |
| `extract`, `extract_retrieved_at` | The **full lead section** (everything before the first heading) of the English article as plain text, and the date it was fetched | Wikipedia |
| `wikipedia_revid`, `wikipedia_revid_timestamp` | Only where known: the id of the English Wikipedia revision whose lead is exactly `extract`, and when it was saved (see "Revision") | Wikipedia |
| `wikidata_classes` | ALL class labels of the Wikidata item, see below | Wikidata |
| `date_start`, `date_end` | Wikidata dates (P585 point in time, else P580 start; P582 end) | Wikidata |
| `countries` | Wikidata's country (P17, or P17 of the P276/P131 place), mapped to the 15 tracked names | Wikidata |
| `category`, `category_group` | A coarse grouping used for marker colours and the category filter (same value in both fields) | **ours** |
| `location_quality`, `coordinates` | `precise`, `approximate` or `none` | Wikipedia/Wikidata coordinates; the rule is ours |
| `date_flags`, `review_reasons`, `needs_review` | Advisory flags | ours (flags only) |
| `wikipedia_lead_dates` | Only next to a `date_order_invalid` flag: the dates (or years) the lead mentions, for the shown note (see "Review flags") | Wikipedia |
| `sitelinks_current` | The item's Wikidata sitelink count (all Wikimedia projects), refreshed monthly; orders the default list (see "Default order") | Wikidata |
| `sitelinks` | Discovered events only: the sitelink count discovery saw (inclusion rule) | Wikidata |
| `wikidata_aliases` | The item's English Wikidata aliases ("also known as"), kept as-is in Wikidata's order; absent when it has none. Refreshed monthly with the sitelink counts. Used by the search only: a result found through an alias rather than its title names the alias the reader typed ("matched: July War"). They are not listed on the event panel, because some are one side's name for the event; the displayed title stays Wikipedia's | Wikidata |

### Extract

Fetched with the MediaWiki API (`action=query&prop=extracts&exintro=1&explaintext=1&redirects=1`), i.e. all paragraphs of the lead as plain
text. Only whitespace is normalised (no-break spaces to plain spaces, runs of spaces collapsed, paragraphs separated by one blank line).
`snippet` (lite data/UI) is the first 160 characters of it. Length before and after the change for the 394 curated events: median 435 -> 1,207
characters, mean 476 -> 1,494, max 1,487 -> 5,481; 327 got longer, 66 were already the whole lead, 1 got shorter (Wikipedia rewrote the lead of the
Battle of Elli in between). The earlier text was mostly the first paragraph only. `extract_retrieved_at` says when the text was fetched, so it can be shown as "as of".

Link previews (`app/scripts/event-page.mjs`): an event page's `description`, `og:description` and `twitter:description` are "Wikipedia: "
followed by the lead's first paragraph, cut at a word to 160 characters in all. The prefix is the same for every event: previews show the
text under the site's name, and a label on the flagged summaries only would make the others look checked. The framing review does not fit
in a preview; the page shows it. The structured data's `description` is the lead's opening alone.

### Revision (`wikipedia_revid`, `wikipedia_revid_timestamp`)

`wikipedia_revid` is the id of the article revision whose lead is exactly the stored `extract`, and `wikipedia_revid_timestamp` is when that
revision was saved (UTC, as the API gives it, e.g. `2026-10-15T19:38:37Z`). Both come from the same request as the lead
(`prop=extracts|pageprops|info|revisions&rvprop=ids|timestamp`: MediaWiki's `lastrevid` and its latest revision's timestamp, used only when the two
name the same revision). They let a citation link that exact version, `https://en.wikipedia.org/w/index.php?title=<title>&oldid=<revid>`, under
that version's date, as APA, MLA and Chicago ask when citing Wikipedia (the citation rules and their sources are in `app/src/lib/citation.js`).
The two are present together or not at all (`validate-events.js` checks it). They are set in three ways only, and are otherwise **absent**, never guessed:

- `scripts/refresh-extracts.js --apply` writes them together with every lead it writes (the revision that lead was read from); an event that
  shows another event's article (see "Events without an article of their own") takes that event's revision and date with its text.
- `node scripts/backfill-revids.js --apply` (run on 2026-10-24, re-runnable) fetched every event's current lead, revision and revision date and
  stored them **only where the current lead equals the stored `extract` exactly**. Where the text had changed on Wikipedia since it was retrieved,
  this mode leaves them absent (see the next point). It changes nothing else in any event. The revision can be newer
  than `extract_retrieved_at` (an edit outside the lead); its lead is still exactly the stored text.
- `node scripts/backfill-revids.js --historical --apply` (run on 2026-10-24, re-runnable) does the same for events whose lead has changed since
  retrieval, with an older revision: it walks the article's revisions back from the current one (`prop=revisions`, 50 per request, section 0
  only), parses the revisions nearest `extract_retrieved_at` first (`action=parse&oldid=<revid>&section=0`), turns that HTML into plain text the
  way TextExtracts does (`scripts/lib/rev-lead.js`: lead only; the same elements removed; tags dropped; entities decoded) and applies the same
  whitespace normalisation, and stores a revision **only when that lead equals the stored `extract` exactly**: the revision current on the
  retrieval day if it matches, else the matching revision nearest that day. TextExtracts serves only current revisions, so the conversion is
  checked rather than assumed: for each article it must reproduce the current TextExtracts lead exactly from the current revision, or the event
  is left without a revision. Old revisions are parsed with today's templates; a lead whose templates have changed their output since simply
  does not match and stays without a revision.

Without them, a citation gives the article's URL and the retrieval date (`extract_retrieved_at`), and the site says the text may have changed since.

### Wikidata classes (`wikidata_classes`)

The labels (English) of **all** the item's `P31` (instance of) statements, in the order Wikidata's entity JSON lists them (deprecated-rank statements
excluded; a class without an English label shows its QID), followed - only if not already present - by the labels of the event classes discovery matched via
subclass (`P279*`) below. Nothing is de-duplicated by our preference, re-ordered, or replaced by our own label. For the hand-picked (legacy) events
the classes come from live Wikidata too (for example Fall of the Assad regime: `regime change`); the old labels such as "political"
or "war" that the curated file used to carry as if they were Wikidata's are gone. `category_label` is removed. Number of classes per event across the
594 events (curated + proposed): 1 class 320, 2: 165, 3: 68, 4: 30, 5: 7, 6: 4.

**What the site lists** (since 2026-10-25; `app/src/lib/eventClasses.js`, the same rule for every event): the event panel and the event
pages list only the stored classes that are on the event-class list (the table in "Category (our grouping)"), i.e. the classes that decided
inclusion and, for terrorism and atrocity, the group, with a link to the Wikidata item for all of them. The data keeps every class. The
other `P31` classes decide nothing on the site and no review reads them, and some are one side's description of the event; on 2026-10-24
400 of the 815 curated events had one, 218 distinct labels, for example "fake news" (Gaza Strip famine), "friendly fire" (Al-Ahli Arab
Hospital explosion), "preemptive war" (June 2025 Israeli strikes on Iran), "sea piracy" (2010 Gaza flotilla raid), "liberation" (Turkish
capture of Smyrna), "crime of aggression" (2026 Iran war) and "counter-terrorist operation" (July 2023 Jenin incursion). 32 events have
no class on the list (mostly hand-picked ones) and show no class line.

### Category (our grouping)

`category` is **our own coarse mapping**, not Wikidata's classification, and the UI labels it "Category (our grouping)". It is set by one rule applied to every
event (`groupForEvent` in `scripts/lib/event-classes.js`):

1. If any of the event's `wikidata_classes` is in the **terrorism** group (terrorist attack, hostage taking, aircraft hijacking, suicide attack), the category is terrorism.
2. Otherwise, if any is in the **atrocity** group (genocide, massacre, war crime, pogrom, mass murder, ethnic cleansing), the category is atrocity.
3. Otherwise, if all of the event's listed classes (those in the table below) belong to **one group**, the category is that group.
4. If they belong to **two or more groups**, the category is **mixed**.
5. If none of its classes is listed, the category is **unclassified**. No event keeps a group set by hand, and neither the order of the
   table nor the order of Wikidata's statements plays any part (a test regroups every shown event under shuffled orders).

`wikidata_classes` holds the item's own `P31` classes and the listed classes it is an instance of through `P279*` (the classes discovery matched), for
hand-picked and discovered events alike, so the rule can be re-applied to the stored data; `scripts/validate-events.js` fails an event whose category is
not what the rule gives. The event's header names the classes behind its group ("Terrorism, from Wikidata's class "suicide attack"";
"Mixed — Wikidata's classes point to more than one group: protest (Protest), revolution (Uprising), war (War)";
"Unclassified: none of its Wikidata classes is on our list"), generated the same way for every event. On the map, mixed is a slate grey
and unclassified a warm grey (contrast against land/sea 4.58/4.19 and 4.33/3.96).

**2026-10-25: "mixed" replaced the table order.** The rule's first version (same day) took the group of the listed class that came first in the
table, so the table's order decided, for example, that an "assassination" also typed "military operation" was war. An event whose listed classes span
several ordinary groups is now "mixed" instead. Compared with the groups shown before 2026-10-25, 82 events changed group: 43 to mixed (30 of them
discovered events, such as the Israeli invasion of the Gaza Strip, the Russian intervention in Syria and the 2024 Hezbollah headquarters strike), 23 to
unclassified, 5 from migration to atrocity, 5 to war and 6 others.

**2026-10-25: the rule replaced the hand-assigned groups.** Until then step 3 applied only to discovered events (in the order discovery happened to match
classes), and the 102 hand-picked events kept the group typed into `data/seed-events.json`, unless step 1 or 2 applied: 43 of them had a group that none
of their own Wikidata classes supported. The hand-picked events were given the listed classes they are instances of through `P279*` (one WDQS query,
2026-10-25; 79 class labels added to 56 of them; the other classes were already there) and every event was regrouped by the rule's first version, in which 43 events changed group: 23 to unclassified (for example the
Balfour Declaration, the Oslo and Abraham Accords, the 1973 oil crisis, the 2020 Beirut explosion and the fall of the Assad regime, whose Wikidata classes,
such as "public statement", "agreement", "oil crisis", "industrial disaster" and "regime change", are not on the list), 9 to war (among them the al-Anfal
campaign, typed "military campaign", the Iraqi revolt of 1920 and the Great Syrian Revolt, typed "revolt", which Wikidata places under "military operation", the capture of Saddam Hussein, the Israeli withdrawal from Lebanon and from Gaza, and the 2024 Hezbollah headquarters
strike, typed "military operation" as well as "assassination", which discovery had matched first), 5 from migration to atrocity (ethnic cleansing, below),
and 6 others (14 July Revolution to political as a coup d'état, the 1929 Palestine riots and the 2011 Egyptian revolution to protest, the Young Turk
Revolution to uprising, the 1930 Anglo-Iraqi treaty to treaty, the Qatar diplomatic crisis to political as an international crisis). `data/seed-events.json`
still holds the group the list was typed with; it no longer sets any group.

**2026-10-25: ethnic cleansing joins the atrocity group.** "Ethnic cleansing" (Q154278, a subclass of "forced displacement" and "atrocity" in Wikidata) was
not on the list, so the five events Wikidata types this way were shown as migration through their "population transfer" class: the Jewish exodus from the
Muslim world, the 1948 Palestinian expulsion and flight, the expulsion from Lydda and Ramle, the 2023 Gaza Strip evacuations and the 1920-21 Yalova
Peninsula massacres. All five are now atrocity, whoever the victims were. The class has 5 dated in-region items with 10+ sitelinks (WDQS, 2026-10-25), all
already found by other classes, so it adds no events. The Nakba, typed "forced displacement" and "population transfer" but not "ethnic cleansing", stays
migration.

Before 2026-09-28 steps 1-2 did not exist: an item Wikidata types as both a "massacre" and a "terrorist attack" was shown as "political" because "massacre"
happened to be checked first. A full review found that this ordering hid the "terrorist attack" type of 18 events, 16 of them attacks on Israelis
(October 7 and the kibbutz and Nova attacks among them), while events typed only "terrorist attack" by Wikidata kept that label whoever the perpetrator was.
The rule still passes Wikidata's typing through without judging it; the UI lists the item's Wikidata classes that are on the event-class list next to our group (see "Wikidata classes").

| Wikidata class | QID | Our group |
|---|---|---|
| battle | Q178561 | war |
| war | Q198 | war |
| military operation | Q645883 | war |
| siege | Q188055 | war |
| treaty | Q131569 | treaty |
| armistice | Q107706 | treaty |
| coup d'état | Q45382 | political |
| assassination | Q3882219 | political |
| genocide | Q41397 | atrocity |
| massacre | Q3199915 | atrocity |
| war crime | Q135010 | atrocity |
| declaration of independence | Q1464916 | political |
| referendum | Q43109 | political |
| terrorist attack | Q2223653 | terrorism |
| hostage taking | Q1371150 | terrorism |
| aircraft hijacking | Q898712 | terrorism |
| revolution | Q10931 | uprising |
| rebellion | Q124734 | uprising |
| population transfer | Q15589476 | migration |
| ceasefire | Q208383 | diplomatic |
| peace conference | Q7157512 | diplomatic |
| embargo | Q989265 | economic |
| nationalization | Q178564 | economic |
| armed conflict | Q350604 | war |
| military campaign | Q831663 | war |
| military occupation | Q188686 | war |
| airstrike | Q2380335 | war |
| bombardment | Q678146 | war |
| aircraft shootdown | Q6539177 | war |
| suicide attack | Q217327 | terrorism |
| pogrom | Q177716 | atrocity |
| mass murder | Q750215 | atrocity |
| riot | Q124757 | protest |
| political crisis | Q3002772 | political |
| international crisis | Q5791104 | political |
| public election | Q40231 | political |
| protest | Q273120 | protest |
| demonstration | Q175331 | protest |
| summit | Q1072326 | diplomatic |
| ethnic cleansing | Q154278 | atrocity |

The last 16 rows were added on 2026-10-06 (see "Event classes"). "Pogrom" and "mass murder" join the overriding atrocity group because Wikidata uses them for
the same kind of event as "massacre"; adding them changed the group of none of the 571 events already shown. "Suicide attack" joins the overriding
terrorism group. It was first placed in the war group (a suicide attack is a method armies use too), but the review of the new events showed what that
did: seven bombings Wikidata types only as "suicide attack" (the Dolphinarium, Sbarro, Passover and Maxim restaurant attacks on Israeli civilians, and the
2003 Istanbul, 2016 Saudi and January 2021 Baghdad bombings) would have been shown as war, while comparable bombings that Wikidata also types "terrorist
attack" are terrorism - the same mechanism as the 2026-09-28 finding above. The owner chose terrorism (2026-10-07), so that the group no longer
depends on whether a Wikidata editor added "terrorist attack" next to "suicide attack". It moved one event already shown, the 2011 southern Israel cross-border attacks, from war to terrorism.
"Terrorism" remains our group name, not a Wikidata label: the UI lists the item's Wikidata classes next to it, and since 2026-10-25 the event header,
the legend and the filters attribute it ("Terrorism (Wikidata: terrorist attack, suicide attack, hostage taking, hijacking)"; "Terrorism, from Wikidata's
class "suicide attack"") as the framing review's MOS:LABEL check asks of the word "terrorist". The group still follows the method classes listed above
(suicide attack, hostage taking, aircraft hijacking) as well as "terrorist attack"; an airstrike or bombardment is war unless Wikidata also types it with
an atrocity or terrorism class. "Protest" is a new group (protest, demonstration, riot); before, the only
protests shown were those Wikidata also types as a revolution or rebellion (uprising). "International crisis" is in the political group like "political
crisis": in Wikidata it is a subclass of "political crisis" (checked in WDQS on 2026-10-06), so every international crisis is found under "political crisis"
first and a different group for it would never apply.

## Inclusion rule

An event is **proposed** (written to `data/events.proposed.json`) if and only if all of these hold:

1. **Class.** Wikidata says it is an instance (`P31`, subclasses followed via `P279*`) of one of the event classes in the table above.
2. **Place.** It is located in one of the 15 tracked countries/territories, via `P17`, or `P276`/`P131` pointing at a place that has `P17` there.
   A place only counts when at least as many of the present-day sovereign states it lists (its `P17`) are inside the region as outside it
   (`placeIsMostlyInRegion` in `scripts/lib/v21.js`). Seas and regions that mostly belong to other countries - the Mediterranean (6 in, 16 out), Black Sea,
   Sahara, Sahel, North Africa, Gulf of Aden, Bab-el-Mandeb - lend no country. Historical predecessors such as the Ottoman Empire or Mandatory Palestine
   are not sovereign states today and count on neither side. The rule only removes country tags derived from such places (the hand-picked
   events keep their hand-typed tags), and an event left with no tracked country is excluded (`data/proposed-exclusions.json`: 23 events on 2026-09-29, 5 more from the classes added on 2026-10-06).

   **Predecessor states** (owner's rule, 2026-10-15). If an item's country (`P17`) is a historical state that Wikidata links to a tracked country
   via *replaced by* / *replaces* (`P1366` / `P1365`, one step: "X replaced by Turkey" or "Turkey replaces X"), it counts only when the item's own
   coordinates (`P625`) fall in a tracked country, or its place's (`P276`) present-day country is a tracked country; it is then tagged with that
   country. "Fall in" means inside the country's present-day border shape in `data/boundaries.json` (the map's own country-to-shape table,
   no tolerance). A place's present-day country is a tracked country in its `P17` that is not itself such a predecessor (so a place whose only
   `P17` is the Ottoman Empire, or Mandatory Palestine, lends none). Present-day sovereign states are never predecessors. The rule is strict:
   a historical `P17` alone never places an event. On 2026-10-15 Wikidata linked 42 such states (among them the Ottoman Empire, the Kingdom of
   Egypt, Pahlavi Iran, the Trucial States, the Yemen Arab Republic, South Yemen, the United Arab Republic and some Ottoman vilayets); 256 items
   had one of them as `P17` and a date from 1900, and 130 of those were dated instances of an event class. 73 of the 130 were already found
   through rule 2's other paths, 47 are not located in a tracked country by this rule and are not counted, and 10 were new: one of them
   has 10+ sitelinks and an English article, the Koçgiri rebellion (`P17` Ottoman Empire, `P276` Sivas Province, Turkey), now in
   `data/events.proposed.json` (not merged; `scripts/enrich-candidates.js --keep-existing` added it without re-deriving the other proposed records).
   Its place would also qualify it through the ordinary `P276` path, but the 2026-10-06 discovery run did not return it (the item was last
   edited on 2026-08-07, so the cause is on the query side; it was not traced further). Code: `scripts/lib/predecessor.js`, run by
   `scripts/discover-events.js` (`--predecessors-only` adds only that pass's new items to `data/event-candidates.json`); such events carry
   the review note `country_via_predecessor_state`, which names the state and the evidence.
3. **Time.** It has a date (`P585` point in time, else `P580` start time) from 1900 to the present.
4. **Significance.** Its Wikidata item has **at least 10 sitelinks** (`INCLUSION_MIN_SITELINKS`) and has an **English Wikipedia article**, or an English
   Wikipedia title that redirects into one (see "Events without an article of their own" below).
5. **Basic integrity.** Wikipedia returned a summary with a non-empty extract.

Since data shape v2.1 two former conditions are **gone**: events **without real coordinates** are included (with `location_quality: "none"`,
`coordinates: null`, no map marker, listed and searchable), and events whose Wikidata **dates are contradictory** (end before start) are included
with the dates as Wikidata gives them and a `date_flags` reason. Nothing is dropped for either reason any more. Events already in the curated
`data/events.json` are not re-proposed.

### Events without an article of their own

Some Wikidata event items have no English Wikipedia article of their own: their English Wikipedia link is a redirect into a larger
article (often a section of it) that belongs to another Wikidata item. They meet rule 4 through that link and **are included, all of them**
(owner's rule, 2026-10-10). Before, the second such event to reach a shared article was left out as a duplicate of the first, so which of
two events stayed depended only on the order they were merged in (for example "June 2025 Israeli strikes on Iran" was in and "June 2025
Iranian strikes on Israel" was out; both redirect into "List of attacks during the Twelve-Day War").

- Their text is the lead of the article the title leads to, shown as Wikipedia gives it, and their framing review is that text's review.
  When another event already shows that article, both show the same text.
- The site says so above the text: "This event has no Wikipedia article of its own: its Wikipedia title leads to the article "…", so the
  text below is that article's and covers more than this event." (`app/src/lib/otherArticle.js`: `resolved_qid` differs from `wikidata_qid`.)
- The map pin is the event's own Wikidata location only (see "Location quality"), never the larger article's.
- The five that had been excluded were added on 2026-10-10 (`docs/data-fixes.md` F12); `data/proposed-exclusions.json` no longer lists
  redirect duplicates. As of 2026-10-10, 8 curated events have no article of their own.

### What "10 sitelinks" really counts

Earlier text said "10 Wikipedia language editions". That was wrong. The rule uses Wikidata's `wikibase:sitelinks`, which counts links to **all Wikimedia
projects** (Wikipedias, but also Wikisource, Wikiquote, Commons, Wikivoyage, ...). Measured on the current discovery candidates
(`node scripts/build-selection-funnel.js`, stored in `data/selection-funnel.json` under `sitelink_measurement`): of the 3,194 candidates with an English
article (2026-10-06, after the class additions), **801** have 10+ sitelinks across all projects (what the rule uses) while **760** would pass if only Wikipedia
language editions were counted; 41 events pass only thanks to non-Wikipedia sitelinks, and none pass by Wikipedia editions but fail by all projects. The median
among passing events is 16 across all projects and 15 counting Wikipedia editions only. (Before the class additions: 1,900, 535, 506 and 29.)
The rule stays as coded (all projects); the documentation now says so.

### Honest caveat: the rule itself is biased

"Objective" here means *mechanical and published*, not *neutral*:

- **Sitelinks count Wikimedia project pages, not importance.** Events that many communities write about (international, modern, English-speaking-world-relevant,
  or well covered by Western media) score high; events important locally or regionally but thinly covered score low. The threshold of 10 is a judgement call
  (roughly the median of the earlier 5+ candidate set), not a validated cutoff. Among events dropped for fewer than 10 sitelinks, 49% have more Arabic/Hebrew/Turkish/Persian
  editions than European ones (dataset-coverage review).
- **The class list is a choice.** Someone had to decide which Wikidata classes count as "events"; classes with many well-modelled items (battles, terrorist attacks)
  are over-represented against concepts Wikidata models loosely (diplomacy, elections, protests), so those are under-found. Elections, protests and summits
  have been searched for since 2026-10-06, but they still pass the 10-sitelink bar less often than battles and attacks do.
- **Wikidata modelling is uneven.** Only events that some editor has typed with a class, dated and located in a tracked country are found at all. Multi-country events
  carry only the countries Wikidata lists.
- **English Wikipedia is required** for an extract, which biases toward what English Wikipedia covers.
- **The hand-picked seed list** (102 events, 42 of them not reachable by the rule; 112 before 2026-10-09 and 103 before 2026-10-15, see "Not events" below) is our own selection.
  It is still the only source of economic events; the rule now also finds diplomatic ones (summits, ceasefires, peace conferences).
- **Location is not required, but it changes visibility.** Events without coordinates are listed but have no marker; abstract and large-area events (wars, referendums,
  treaties) lack coordinates far more often than point-like ones.

The funnel from 5,063 raw candidates to what is shown, with breakdowns by country, class, group and decade, is machine readable in `data/selection-funnel.json`
(recomputed from the data files by `scripts/build-selection-funnel.js`, not copied from documents) so the app's About page can render it.
Its `coverage` block (added 2026-10-15) counts what is shown (`data/events.json`): per country as tagged and again without the events tagged
with 8 or more countries (17 on 2026-10-15: the world wars and other region-wide conflicts, which otherwise count in each of their countries),
per decade of the start date, and per category; the About page shows it under "Coverage". It also records how many events the economic category holds: one
(the 1973 oil crisis, from the hand-picked list) until 2026-10-25, none since, as the oil crisis is typed "oil crisis" and "economic crisis", which are not
on the list. CI keeps the file current (`--check`).

These biases are visible in the data; the project does not attempt to correct them, because a correction would be an editorial judgement of the very kind this policy avoids.
Bias in the wording of individual summaries is handled the same way: it is not corrected, but it is disclosed next to the text by the framing review (see `docs/framing-review.md`).

### Known gaps: major events the rule does not reach

Some well-known events fail the rule because of how Wikidata models them, not because of their significance. They are listed here, with the
reason read from their Wikidata items (wbgetentities, 2026-10-15), and they are **not** added by hand: no seeds are added for them. The
Armenian genocide and the Young Turk Revolution are the two of them that are shown, only because they are on the hand-picked list from before the rule.

| Event (QID) | Sitelinks | Why the rule misses it |
|---|---|---|
| Armenian genocide (Q80034) | 125 | `P17` Ottoman Empire; `P276` Ottoman Empire, Western Armenia (no `P17`) and the Six vilayets (`P17` Ottoman Empire); no `P625`. No present-day place, so the predecessor rule does not place it. Shown because it is a hand-picked event. |
| Sayfo (Q852236) | 53 | `P17` Ottoman Empire; `P276` West Asia, which has no `P17`; no `P625`. |
| Young Turk Revolution (Q4298662) | 46 | `P17` and `P276` Ottoman Empire; no `P625`. Shown because it is a hand-picked event. |
| Population exchange between Greece and Turkey (Q131017) | 42 | No `P17`, `P276`, `P131` or `P625` at all. |
| Greek genocide (Q911233) | 36 | `P17` and `P276` Ottoman Empire; no `P625`. |
| Taif Agreement (Q321936) | 24 | No `P17`, `P276`, `P131` or `P625` at all (a "peace treaty", dated 1989 at year precision). |
| 1913 Ottoman coup d'état (Q4559693) | 17 | `P17` Ottoman Empire; no `P276` or `P625`. |
| Treaty of London (1946) (Q541293) | 10 | Meets the class (treaty), date (1946, year precision), English-article and sitelink (exactly 10) conditions, but `P17` is the United Kingdom and `P276` is London: no tracked country. Checked 2026-10-15, when "Jordanian independence" was removed. |

Each of these would be found by the rule once Wikidata records a place (`P276`) whose present-day country is tracked; for those whose `P17`
is the Ottoman Empire, coordinates (`P625`) inside a tracked country would also do. That is an upstream edit, which this project does not make.

### Not events: people, organisations and states

The site lists events. An entry whose Wikidata item is a **person, an organisation or a state** (by its `P31` classes, e.g. `human`, `political
organization`, `historical country`) is not an event and is not included. The class rule above never finds such items; only the hand-picked list
contained them. On 2026-10-09 this removed nine hand-picked entries: Saddam Hussein and Hafez al-Assad (`human`); Hamas, the Palestine Liberation
Organization, Islamic State and the Central Treaty Organization (listed as "Baghdad Pact"; organisation classes); the Kingdom of Iraq, the United Arab
Republic and Syrian independence (state classes). Events about them stay (for example the Execution of Saddam Hussein, the 14 July Revolution).
The Iranian Green Movement (`social movement`, in practice the 2009 protests) is kept.

On 2026-10-15 the rule was extended to the **history of a country** (Wikidata class `history of a country or state`, Q17544377) and is now
applied by code instead of by hand: `NOT_EVENT_CLASSES` in `scripts/lib/event-classes.js` lists the classes (human; organization, political,
military, terrorist and armed organization; historical country, state, sovereign state, self-proclaimed state, quasi-state; history of a country
or state), matched against the stored `wikidata_classes`. `scripts/merge-proposed.js` removes a curated entry that has one of them (listed in its
dry run; `--no-add` applies the rules without adding proposed events), `scripts/enrich-candidates.js` never proposes one (`exclusion_reason:
not_an_event`), and `validate-events.js` warns about any it finds. The run of 2026-10-15 (`merge-proposed.js --apply --no-add`) removed one
hand-picked entry, "Jordanian independence", whose Wikidata item (Q1639050) and Wikipedia link are the *history of Jordan*; its seed line and
framing review were removed with it. No other curated or proposed event has one of these classes. The Emirate of Transjordan (classes `League
of Nations mandate`, `British protectorate`) does not match the list and is kept.

## Default order

With no search, filter or drawn area, the list shows the events of the selected years **most covered first**: by `sitelinks_current`, the same
mechanical signal as the inclusion rule (the item's Wikidata sitelinks across all Wikimedia projects), highest first, equal counts in date order.
Events that began before the selected years (still ongoing in them) follow those that began within them, so a single year does not open with every
long conflict that overlaps it (`app/src/lib/browseOrder.js`). A **Sort: Coverage · Date** switch under the count changes the order;
pressing the active one reverses it (least covered first, or newest first). The link keeps the choice (`?sort=coverage-asc`, `date`, `date-desc`). Search results are not affected: they keep their relevance order.

The order inherits the caveats of the inclusion rule above: sitelinks measure how many Wikimedia communities wrote about an item, not importance,
and favour international, modern and widely covered events. It is a published rule applied to every event alike, not a per-event choice.
The counts are refreshed monthly with the extracts (`scripts/refresh-sitelinks.js`, see "Refreshing extracts").

## Event classes

All QIDs were checked against the live Wikidata Query Service on 2026-09-26 (English label matches; instance counts are dated 1900+ in the tracked region,
before the sitelinks filter; "s>=10" is how many of those have 10+ sitelinks).

| Class | QID | Group | In region (transitive) | s>=10 |
|---|---|---|---|---|
| battle, war, military operation, treaty, coup d'état, assassination, genocide, massacre, terrorist attack, revolution, rebellion, population transfer | (original set, see `event-classes.js`) | | | |
| siege | Q188055 | war | 74 | 18 |
| war crime | Q135010 | atrocity | 131 | 19 |
| hostage taking | Q1371150 | terrorism | 16 | 5 |
| aircraft hijacking | Q898712 | terrorism | 9 | 4 |
| ceasefire | Q208383 | diplomatic | 10 | 5 |
| armistice | Q107706 | treaty | 3 | 2 |
| peace conference | Q7157512 | diplomatic | 3 | 2 |
| embargo | Q989265 | economic | 0 | 0 |
| nationalization | Q178564 | economic | 2 | 0 |
| declaration of independence | Q1464916 | political | 5 | 3 |
| referendum | Q43109 | political | 58 | 10 |

Two classes (embargo, nationalization) contribute nothing today; they are kept so events will be picked up if Wikidata editors add them. Considered and not added:
general strike (Q49775), prisoner exchange (Q2001775).

**Added 2026-10-06.** A probe of 37 further classes (same query as discovery, 2026-10-06) found well-known events that the rule could not reach only because
Wikidata types them with a class outside the list: for example the Deir Yassin massacre and the Farhud ("mass murder", "pogrom"), the Cave of the Patriarchs
and Passover massacres, the Sbarro and Dolphinarium bombings ("suicide attack"), Operation Opera and the 2024 Iranian strikes on Israel ("airstrike", "armed
conflict"), Iran Air Flight 655 ("aircraft shootdown"). The 12 classes that closed this gap, and 4 civic classes the caveat above named as under-found
(elections, protests, summits), were added. "New, s>=10" counts items not already found by an earlier class; an item matching several new classes is counted
under each, so the column does not add up to the total.

| Class | QID | Group | In region (transitive) | New, s>=10 |
|---|---|---|---|---|
| armed conflict | Q350604 | war | 1,438 | 101 |
| military campaign | Q831663 | war | 46 | 9 |
| military occupation | Q188686 | war | 16 | 7 |
| airstrike | Q2380335 | war | 244 | 26 |
| bombardment | Q678146 | war | 260 | 29 |
| aircraft shootdown | Q6539177 | war | 9 | 4 |
| suicide attack | Q217327 | terrorism | 210 | 7 |
| pogrom | Q177716 | atrocity | 12 | 7 |
| mass murder | Q750215 | atrocity | 586 | 11 |
| riot | Q124757 | protest | 56 | 14 |
| political crisis | Q3002772 | political | 112 | 24 |
| international crisis | Q5791104 | political | 69 | 21 |
| public election | Q40231 | political | 1,679 | 91 |
| protest | Q273120 | protest | 176 | 31 |
| demonstration | Q175331 | protest | 49 | 9 |
| summit | Q1072326 | diplomatic | 52 | 7 |

Probed and not added: agreement (Q321839; in this region it returns currencies such as the Turkish lira and the new shekel), and insurgency, intifada,
ethnic cleansing, deportation, refugee crisis, UN Security Council resolution, proxy war (nothing the existing classes do not already find). Natural
disasters and accidents (earthquake, aviation accident, epidemic, famine) were left out as outside the site's subject; adding them would be a scope decision,
not a gap fix.

### Query robustness

Each class is queried separately. WDQS answers a class query that is too expensive with HTTP 504; the script then fetches the class's subclass tree (`P279*`)
on its own and queries `P31` instances of 250 subclasses at a time, which is the same rule split into requests that finish in time ("public election", with
thousands of per-country subclasses, needs this: plain `P31` found 3 of its 91 new items). Only if that fails too does it retry once with plain `P31` (no subclass expansion)
and logs that it did so. If a class still fails, the run writes nothing and exits with an error naming the failed classes (rewriting the file without
them would silently drop their candidates). An item with several date values gets the earliest start (`MIN` of P585, else of P580) and the latest
end (`MAX` of P582), and every list is sorted with the QID as the final tiebreak, so a re-run on unchanged Wikidata gives an identical file.
429/5xx responses on the other Wikimedia APIs are retried with exponential backoff honouring `Retry-After` (seconds or an HTTP date). Requests are sequential, delayed
and identify themselves with the `MiddleEastEvents` User-Agent (`MiddleEastEvents/0.1 (data pipeline; +https://github.com/kei-nan/meast-events)`).

## Review flags (advisory only)

Each event may carry `review_reasons` (strings) and `date_flags`; none of them changes the data. The event panel and the event pages' plain-HTML copy show a note only for
`date_order_invalid`, in plain language without the flag code (`app/src/lib/dateOrderNote.js`), e.g. "Wikidata gives this event's end
(1 January 2002) as before its start (27 March 2002); Wikipedia gives 27 March 2002." The other date flags stay in the data and the checks
but are not shown; an event with any date flag still shows only the years in its date line.

| Flag | Where | Meaning |
|---|---|---|
| `date_order_invalid` | `date_flags` | Wikidata's `date_end` is before `date_start` (4 curated events on 2026-10-10, e.g. Iraqi invasion of Kuwait: start 2009-08-02, end 1990-08-04). Kept, shown as Wikidata gives them. Validation downgrades the order error to a warning only when this flag is present. |
| `wikipedia_dates_note` | `date_flags` | NOTE next to a date-order error: the dates/years the article's lead mentions (`scripts/lib/v21.js`, `wikipediaDatesNote`). Informational; it never changes a date. The same dates, as data, are in `wikipedia_lead_dates` ("YYYY-MM-DD", or "YYYY" years when the lead gives no full date; `wikipediaLeadDates`), set only next to `date_order_invalid`, for the shown note. |
| `date_end_precision_coarse` | `date_flags` | Wikidata's end time is coarser than a day (e.g. the year "2002", stored as 2002-01-01) and the stored `date_end` is before `date_start` only because of that: the whole year (month, decade, century) reaches the start, so the dates are not reversed. Replaces `date_order_invalid` in that case (Passover massacre: P585 27 March 2002, P582 "2002"; added 2026-10-14, `dateOrderFlags` in `scripts/lib/v21.js`). When a coarse end is reversed even at its precision, `date_order_invalid` names the precision. Not shown; the stored dates are unchanged. |
| `date_start_year_not_in_lead` | `date_flags` | Start year is not within 1 year of any year in the full lead. A heuristic on prose: "look", not "wrong". |
| `date_source_adjusted` | `date_flags` | The discovery date came from an implausible P585; P580 was used instead (rule in `docs/data-fixes.md` F2, both values in the text). |
| `date_precision_coarse`, `unverified_date`, `category_year_mismatch` | `review_reasons` | Date precision coarser than a year; no year in the lead and no confirming year category; Wikipedia year categories disagree. |
| `title_differs_from_article` | `review_reasons` | Record title differs from the article title and does not appear in its lead. |
| `country_not_supported_by_wikidata`, `country_via_place_only` | `review_reasons` | Tracked country tag cannot be derived from Wikidata P17/P276/P131, or comes only from a place while the item's own P17 is another sovereign state. |
| `coordinate_far_from_countries` | `review_reasons` | Real coordinates more than 1,500 km from every tagged country's reference point. |
| `coordinate_low_precision` | `review_reasons` | A precise pin whose latitude and longitude both have at most one decimal place (about 11 km, or 111 km for whole degrees), e.g. Al-Anfal campaign 33, 43. Kept as the source gives it; the site shows it as approximate (see "Location quality"). |
| `title_years_outside_dates` | `review_reasons` | A year the title names lies outside `date_start`..`date_end` (years only; with no `date_end`, only years before the start), e.g. "2009 Iranian presidential election protests", Wikidata 2010-02-11 to 2010-12-07. Neither the title nor the dates are changed. |
| `many_countries` | `review_reasons` | More than 4 countries tagged. All are kept as Wikidata lists them. |
| `part_of` | `review_reasons` | Wikidata `P361` says the event is part of a larger event. |
| `possible_duplicate` | `review_reasons` | Hint that another event may be the same (shared QID, same normalised title, or similar title + date within 1 year + nearby). Nothing is dropped automatically. |
| `qid_mismatch` | `review_reasons` | The Wikipedia title resolved to a different Wikidata item than discovery found. |
| `data_fix Fn` | `review_reasons` | A verified fix from `docs/data-fixes.md` was applied to this event. |

## Location quality

- `precise`: coordinates from the English Wikipedia article or the item's Wikidata `P625` (`coordinate_source` = `wikipedia` / `wikidata` / `manual-override`).
  **An event is pinned only at its own location** (owner's rule, 2026-10-10; `docs/data-fixes.md` F11). When the event's title redirects to the article
  of a **different** item (its `resolved_qid` differs from `wikidata_qid`), that article's coordinates and that item's `P625` are not the event's, so
  `scripts/enrich-candidates.js` uses only the event item's own `P625`, else the event has no location. `coordinate_source` = `redirect_target` (a point
  from a different item) is no longer produced; the validator still warns about it, and about older records with `wikipedia` coordinates and a different
  `resolved_qid`. A borrowed `wikidata` point cannot be told apart from the event's own `P625` in the stored data; the four known cases were checked
  against Wikidata and fixed (F11).
- `approximate`: curated events whose `coordinate_source` starts with `country-fallback` are pinned at a capital (74 events on 2026-10-10, unchanged behaviour). They are labelled
  "approximate location" and excluded from drawn-area searches.

  **A fallback pin marks the country, not the event's place.** It is the same point for every event of that country, taken from
  `COUNTRY_CAPITALS` in `scripts/lib/geo.js` (also the reference point of the `coordinate_far_from_countries` flag), whatever the event's date:
  a Turkey event from before 1923 sits at Ankara, which became the capital only in 1923, and a Saudi event before 1932 at Riyadh. The event
  panel and the static event page therefore call it a reference point, not a capital, and name it (`app/src/lib/fallbackPoint.js`): "its
  marker is placed at the one reference point used for every such event of Israel/Palestine (Jerusalem), whatever its date. The marker
  shows the country, not where the event happened, and says nothing about the status of that city."

  | Country tag | Point (lat, lon) | Where it is |
  |---|---|---|
  | Turkey | 39.9334, 32.8597 | Ankara |
  | Iran | 35.6892, 51.389 | Tehran |
  | Iraq | 33.3152, 44.3661 | Baghdad |
  | Syria | 33.5138, 36.2765 | Damascus |
  | Lebanon | 33.8938, 35.5018 | Beirut |
  | Jordan | 31.9454, 35.9284 | Amman |
  | Israel/Palestine | 31.7683, 35.2137 | Jerusalem: the city's conventional coordinate, which lies in West Jerusalem |
  | Egypt | 30.0444, 31.2357 | Cairo |
  | Saudi Arabia | 24.7136, 46.6753 | Riyadh |
  | Yemen | 15.3694, 44.191 | Sanaa |
  | Kuwait | 29.3759, 47.9774 | Kuwait City |
  | Bahrain | 26.2285, 50.586 | Manama |
  | Qatar | 25.2854, 51.531 | Doha |
  | UAE | 24.4539, 54.3773 | Abu Dhabi |
  | Oman | 23.5859, 58.4059 | Muscat |

  The Israel/Palestine point is one point for the combined tag. It is not a statement about the city's status; it is the coordinate commonly
  given for Jerusalem, and it falls in West Jerusalem. The coordinates are unchanged (owner's decision, 2026-10-15); only this description is new.
- **Rounded precise pins** (since 2026-10-24): a `precise` pin whose latitude and longitude both have at most one decimal place (`isLowPrecisionPin` in
  `app/src/lib/coordPrecision.js`; 15 curated events on 2026-10-24, e.g. Al-Anfal campaign 33, 43 from Wikidata, Operation Crusader 30, 24 from Wikipedia)
  marks an area of about 11 km (one decimal) to 111 km (whole degrees), not a site. The data keeps `location_quality` `precise` and the coordinates as the
  source gives them; the site's build (`app/scripts/split-data.mjs`) publishes such an event as `approximate` with `approximate_reason: "rounded"`, so it gets
  the approximate treatment (hollow ring, "Approximate location" tag, left out of drawn-area searches, its countries shaded) with its own note: the marker
  is at the rounded coordinates the source gives, not at a capital. The validator warns about each (`coordinate_low_precision`).
- `none`: no real location known. `coordinates: null`, `coordinate_source: null`. The event is listed and searchable but has no map marker and never matches an area/bbox query.
  Discovered events never get a capital-fallback pin any more. As of 2026-10-10: 378 of the 816 curated events and 186 of the 254 proposed events
  (counted from `data/events.json` and `data/events.proposed.json`).
- Validation (`scripts/lib/validate.js`): coordinates are required unless `location_quality` is `none` (then they must be `null`), and
  `coordinate_source` must match the quality: `precise` = `wikipedia` / `wikidata` / `manual-override` / `redirect_target`, `approximate` = `country-fallback:<tracked country>`,
  `none` = `null`. Coordinates outside a generous Middle East box (lat 10-44, lon 24-65) are only a warning, because a few events really happened
  abroad (San Remo, Madrid, Algiers, Kandahar, Washington); coordinates that would fall inside the box with latitude and longitude exchanged are an error.
- `data/missing-coordinates-report.md` lists every curated event lacking a precise location (no coordinates or a capital fallback) and every proposed event without a
  location that is not curated yet, sorted by the stored sitelink counts, with Wikipedia and Wikidata links, so contributions can be made upstream (Wikidata `P625`).
  It is generated from the two event files without network (`node scripts/build-missing-coordinates-report.js`; `enrich-candidates.js` writes the same), and CI fails
  when the committed copy no longer matches them (`--check`; the monthly refresh regenerates it).

## Map borders: which cases are drawn as flagged shapes

A border is dashed when its shape carries a `status` (mandate, occupation, unrecognised annexation, dispute, shared sovereignty,
an Oslo-era area, a separate administration, active conflict or a ceasefire partition; labels in `app/src/components/mapBorders.js`).
A shape whose status ends in `-included` (Israel from 1967) stays solid: it contains flagged areas drawn on top of it.

The rule for giving an occupied, annexed or disputed area a dashed shape of its own: **only where a source gives us its outline**
(a CShapes 2.0 record, a shape computed from CShapes records, UN OCHA's West Bank layer, Natural Earth, or a treaty's own
coordinates). We never hand-draw a front line or a zone. The cases drawn this way are the West Bank and Gaza Strip (1948 on),
the Golan Heights (1967 on), Kuwait in 1990-1991, Abu Musa and Greater Tunb, the Sanjak of Alexandretta (1922-1938), and the two
Uqair neutral zones.

Known cases that are therefore **not** drawn as shapes of their own (checked 2026-10-25 by testing a point in each against
`data/boundaries.json`); they show as part of the state named:

| Case | Map shows it inside | Why not drawn |
|---|---|---|
| Sinai under Israeli occupation, 1967-1978 | Israel (CShapes' own record; Egypt's note says so) | Could be computed from CShapes records (Egypt 1979 minus Egypt 1967), not done yet |
| East Jerusalem after 1967 | the West Bank shapes; from 2000 Area C (both notes say so) | OCHA's layer has it as its own class from 2000 only; earlier no source outlines it |
| Israel's occupation of part of southern Lebanon (UN Security Council Resolution 425 (1978) called on Israel to "withdraw forthwith its forces from all Lebanese territory") | Lebanon | No sourced outline of the zone |
| Iraqi-held Iranian territory in the Iran-Iraq War (e.g. Khorramshahr; Resolution 514 (1982) called for "a withdrawal of forces to internationally recognized boundaries") | Iran | Front lines, no sourced outline |
| Turkish-held areas of northern Syria (e.g. Afrin) | Syria | No sourced outline |
| The US-led occupation of Iraq, 2003 (Resolution 1483 (2003) names the US and UK "occupying powers") | Iraq | Whole state; not flagged |

Two cases sometimes compared with these are of a different kind: Hatay, ceded to Turkey by France, the mandatory power, in 1939
(drawn as the Sanjak of Alexandretta until 1938, inside Turkey after), and the Halaib Triangle, administered by Egypt and claimed by
Sudan, which CShapes draws inside Egypt in every year (the map draws no Sudan). Neither is a military occupation; neither carries
a dispute flag, unlike Abu Musa and Greater Tunb. Legal characterisations in the notes quote their source: the ICJ advisory opinion
of 19 July 2024 ([UN doc. A/78/968](https://documents.un.org/api/symbol/access?s=A/78/968&l=en&t=pdf)) on Gaza (para. 94) and on
the Oslo areas (paras. 78, 102), and Security Council Resolutions 252 (1968) and 478 (1980) on East Jerusalem.

## Map borders: where there is no shape

The time-driven borders (`data/boundaries.json`) come from CShapes 2.0 plus our documented corrections (`scripts/boundary-corrections.js`).
CShapes codes independent states and only some colonial dependencies, and the import (`REGION_ENTITIES` in `scripts/ingest-boundaries.js`) takes
20 of its entities. A territory with no shape for a year is simply blank on the map that year: we do not draw a border we have no source for.
The map gives each year to the record in force on 1 July, so a state that CShapes starts in the second half of a year appears the next year.
Checked on 2026-10-06 by testing a point in each place against every feature for every year 1900-2026:

| Place | No shape in | What CShapes has |
|---|---|---|
| Najd / central Arabia (Riyadh, Ha'il) | 1900-1932 | Saudi Arabia from 23 Sep 1932 (first map year 1933). No Najd, Jabal Shammar or Sultanate of Nejd record. |
| Hejaz (Mecca, Jeddah) | 1920-1932 | Drawn inside the Ottoman Empire shape through 1919 (CShapes' Ottoman record runs to April 1920); no Kingdom of Hejaz record. |
| Al-Hasa / eastern Arabia (Dhahran) | 1915-1932 | Inside the Ottoman Empire shape through 1914. |
| Kuwait | 1915-1960 | Inside the Ottoman Empire shape through 1914; Kuwait from 19 Jun 1961 (first map year 1961). The Saudi-Kuwaiti Neutral Zone (our addition) is drawn from 1922. |
| Bahrain | 1900-1971 | Bahrain from 15 Aug 1971 (first map year 1972). |
| Qatar | 1900-1916 | Qatar from 3 Nov 1916 (first map year 1917). |
| Aden and South Arabia (Aden, Lahij, Mukalla, Seiyun) | 1900-1936 | Nothing for the area before 1937. From 1937 its Aden unit (shown as Aden Colony and Western Aden Protectorate) and East Aden Protectorate (Apr 1937 - Apr 1962, map years 1937-1961), then its Federation of South Arabia (Apr 1962 - Nov 1967, map years 1962-1967; the shape also covers the Protectorate of South Arabia states that never joined), then the People's Republic of South Yemen from 30 Nov 1967 (first map year 1968). |

Everywhere else among the 15 tracked countries a point is covered in every year: Turkey and Iran from before 1900, Egypt from 1899, Iraq, Syria,
Lebanon, Jordan and Israel/Palestine by the Ottoman Empire shape through 1919 and by mandate or state shapes from 1920, the Trucial States
(later the UAE) from 1892, Muscat and Oman from before 1900, and northern Yemen by the Ottoman Empire shape through 1918 and the Mutawakkilite Kingdom from 1919.
Kuwait in 1990-1991 is drawn under the name "Kuwait (annexed by Iraq)", which `validate-boundaries.js` reports as a gap in the name "Kuwait".

Where one of our added shapes (the Sanjak of Alexandretta, the Saudi-Kuwaiti Neutral Zone) meets a CShapes neighbour, the two sources' lines leave
thin unclaimed slivers; the "fit" entries give such a sliver to the neighbour. Only land that lies between the two shapes is filled (the gap a
3-5 km disc rolled around the outside of both cannot reach, the sea counting as a wall), so a fill never reaches past either shape's line into
open land. Where a sliver opens onto land that belongs to neither, the fill stops inside that opening; the line across it is the only stretch
not taken from a source (at most about 0.6 km from the nearest sourced line, checked 2026-10-10). Land outside every shape stays blank.

The fits work against a land mask (`data/land-mask.json`, built by `scripts/build-land.js`: Natural Earth 1:10m in the region, the scale of
the border sources' own coasts), which has its own coastline; in places it lies a little seaward of a shape's coast. Within the area a fit
works on, such a coastal strip that no shape covers goes to the shape directly behind it (the one it shares the most boundary with), never to a
shape it does not touch; elsewhere these strips are left as they are. From 1948 this adds 0.33 km2 of coast to Israel by the Gaza Strip's
northern edge (around 34.50E 31.59N), and at most 0.002 km2 to the Saudi-Kuwaiti Neutral Zone (changed 2026-10-12: the mask was Natural Earth
1:50m, whose coarser coast made these strips 54.7 km2 for the neutral zone in 1922-1969 and 56.0 km2 for the Sanjak of Alexandretta in
1922-1938; the 1:10m coast also gives Saudi Arabia 12.4 km2 of coast south of the zone in 1933-1969 and leaves 7.7 km2 of the French Mandate of
Syria's coast south of the sanjak blank in 1922-1938, where the 1:50m coast had lain inside them). Land that CShapes draws as Kuwait (from 1961) is never given to Saudi Arabia:
the 87 km2 west of the neutral zone (around 47.61E 28.69N), which Natural Earth's modern Kuwait also includes, and a 5 km2 strip by the zone's
north-west corner are Kuwait from 1961 and blank before, like the rest of Kuwait (changed 2026-10-11; before, Saudi Arabia held them 1933-1969).

## Pipeline and workflow

```
node scripts/discover-events.js [--classes=Q...,Q...]   # WDQS -> data/event-candidates.json (bounded runs merge)
node scripts/discover-events.js --predecessors-only     # only the predecessor-state pass; adds its new items (rule 2)
node scripts/enrich-candidates.js [--reuse] [--limit=N] [--keep-existing]
                                                        # -> data/enriched-candidates.json, data/events.proposed.json,
                                                        #    data/missing-coordinates-report.md   (full lead, classes, flags)
node scripts/enrich-seed.js [--apply]                   # -> data/seed-enrichment.proposed.json: date_precision, part_of,
                                                        #    resolved_qid, wikidata_description for the hand-picked seed
                                                        #    events that lack them; --apply writes them into data/events.json
                                                        #    only where the stored date is a Wikidata P585/P580 value or a
                                                        #    verified F13/F14 entry (docs/data-fixes.md) settles it
                                                        #    (run 2026-10-24: 83 of 102 applied, 19 left as they are)
node scripts/refresh-extracts.js [--apply] [--proposed] # monthly lead and title refresh (automatic), see below
node scripts/refresh-sitelinks.js [--apply]             # monthly sitelinks_current refresh (automatic), see below
node scripts/refresh-guidelines.js [--apply]            # monthly check of the cited Wikipedia guideline sections, see below
node scripts/build-selection-funnel.js [--check|--offline] # -> data/selection-funnel.json (dated by its input data, not the clock;
                                                        #    --offline keeps the committed sitelink_measurement, no network)
node scripts/build-missing-coordinates-report.js [--check] # -> data/missing-coordinates-report.md (no network)
node scripts/verify-sample.js                           # -> data/import-verification-sample.md (live re-fetch of a seeded sample)
node scripts/validate-events.js                         # schema/ids/dates/coordinates + framing-review coverage (runs in CI)
                                                        # CI also runs both builders above with --check: a report that no longer matches the data fails
npm run validate-boundaries                             # data/boundaries.json structure, year gaps, overlaps, ring crossings (runs in CI; needs root npm ci)
node scripts/merge-proposed.js [--apply] [--no-add]     # dry-run by default; --apply writes data/events.json. Every run also
                                                        #    applies the "Not events" rule and carries re-derived date-order
                                                        #    flags to curated records (--no-add: only that, nothing added)
```

Network scripts cache fetched data outside the repo (`ATLAS_CACHE_DIR` or `--cache-dir=`, default: OS temp dir), so an interrupted run resumes.
Cached entries do not expire by default; `--fresh` ignores the whole cache for a run, and `--cache-max-age=7d` (or `ATLAS_CACHE_MAX_AGE`) ignores entries
older than that (units s, m, h, d; `scripts/lib/cache.js`). Every request times out after 60 s (WDQS queries 90 s, past the service's own 60 s limit) and
is then retried like a dropped connection.

Pipeline output never touches `data/events.json`. Only an explicit `merge-proposed.js --apply` run by a person does, plus `refresh-extracts.js --apply`
(deliberate, and run monthly through a pull request). The one-off shape-v2.1 migration script `scripts/apply-v21.js` has been removed; it is kept in git history.
There is no second, committed copy of the events any more: `app/public/data/` is generated from `data/` by `app/scripts/split-data.mjs` on every dev start and
build, and is gitignored.

`validate-events.js` checks format and internal consistency only, and never judges content. **Errors** (CI fails): ids `[a-z0-9-]+`, unique ids and QIDs,
real calendar dates from 1900 to next year, `date_end >= date_start` unless `date_flags` explains it, coordinates present unless `location_quality` is `none`,
`location_quality` matching `coordinate_source` (see "Location quality"), no lat/lon swap, `category` and `category_group` equal and one of the groups in
`scripts/lib/event-classes.js` (war, treaty, political, atrocity, terrorism, uprising, protest, migration, diplomatic, economic, unclassified) and equal to what the grouping rule (`groupForEvent`) gives for its `wikidata_classes`, `wikidata_classes` array,
`extract_retrieved_at` date, no `category_label`, non-empty extract. **Warnings** (listed, CI passes): coordinates outside the Middle East box, an extract
shorter than the 160-character list snippet, a `resolved_qid` (the Wikidata item of the article at `wikipedia_url`) different from `wikidata_qid`
(merged into one "coordinates are borrowed" warning when the pin is that other item's: `coordinate_source` `redirect_target`, or `wikipedia` with a different
`resolved_qid`), a `date_start` later than the day the event's data was retrieved (`extract_retrieved_at`; a scheduled event such as an upcoming election),
a `date_end` before `date_start` that `date_flags` explains (`date_order_invalid`, or `date_end_precision_coarse` when the end's precision-wide period really reaches the start), a **precise pin outside every tagged country**: more than 5 km outside all border shapes
(`data/boundaries.json`) that stand for the event's countries in its start year, using the map's own country-to-shape table
(`COUNTRY_SHAPES` in `app/src/lib/eventCountries.js`; not checked when a tagged country has no shape that year, for `regional`, or for a point already
outside the Middle East box; needs the root `npm ci`, otherwise skipped with a note),
`possible_duplicates` naming an id that is in neither the file nor (for the proposed file) the curated file, and, for the curated file, an event without a
framing review or whose review is stale (its `text_sha1` is not the SHA-1 of the current extract, the same test the site uses to show "may no longer apply").
Since 2026-10-14 also: a `wikipedia_url` that is not on English Wikipedia (rule 4); for discovered events (those with a discovery `sitelinks` count; the hand-picked
seed events are exempt) a discovery count below the rule's 10, a `sitelinks_current` that has since fallen below 10, and a missing `date_precision`; a
`date_precision` that is not a Wikidata precision name; a decade-or-coarser `date_start` with no `date_end` (e.g. `israeli-lebanese-conflict`, Wikidata
P580 "+2000" at century precision, i.e. the 20th century, stored as 2000-01-01); an event tagged with 8 or more countries; and two events sharing a
`wikipedia_url` or an identical extract, naming the other event (since 2026-10-24 also when all but one of them are events without an article of their own,
whose `resolved_qid` differs, see above; the warning then says which one is the article's own event). Since 2026-10-24 also: a hand-picked seed event without
`date_precision` (its date shows as the year only; `scripts/enrich-seed.js` proposes the Wikidata value; 19 left after its 2026-10-24 `--apply`), a year in the title outside `date_start`..`date_end`
(`title_years_outside_dates`), and a precise pin rounded to at most one decimal place (`coordinate_low_precision`); both are also pipeline flags, see
"Review flags". Warnings are for a person to look at; nothing is changed automatically.

`validate-boundaries.js` (logic in `scripts/lib/boundary-checks.js`) checks `data/boundaries.json` the same way. Errors: missing `name`, `start_year`,
`end_year` or `source`, a bad year range or geometry type, or two shapes with the same name in the same year. Warnings: a feature without a `status` or
`note` key, a status value with no label in the app, a year gap between shapes of the same name, a ring that crosses itself (two of its segments
cross at a point inside both; touching at a vertex is not counted; one warning per feature listing ring, segments and place), and an area of at
least 0.5 km² covered by two shapes shown in the same year. Overlaps between a shape whose status ends in `-included` (for example Israel from 1967, `occupied-territory-included`) and a
flagged shape drawn on top of it (the West Bank, Gaza Strip and Golan Heights) are intentional and not listed. Smaller slivers along shared borders
(at most about 0.13 km² on the current data) come from two separately sourced lines not coinciding exactly and are only counted. It never edits geometry.

## Refreshing extracts (monthly, automatic)

Wikipedia leads change (for example the Fall of the Assad regime lead moved from "1971" to "1970" within two weeks). The **Refresh Wikipedia summaries** workflow
(`.github/workflows/refresh-data.yml`) runs on the 1st of each month, and on demand from the Actions tab ("Run workflow"):

1. It runs `node scripts/refresh-extracts.js --apply`, which re-fetches every lead uncached. Only leads whose text changed are updated, with
   `extract_retrieved_at` set to that day and `wikipedia_revid`/`wikipedia_revid_timestamp` to the revision the new lead came from and its date; unchanged events are not touched, so the diff contains only real changes. The same run updates titles of
   renamed articles (see "Titles" below). It then runs `node scripts/refresh-sitelinks.js --apply`, which updates each event's
   `sitelinks_current` (the count behind the default list order, see "Default order"). Last, `node scripts/refresh-guidelines.js --apply` compares
   the Wikipedia guideline sections the framing review cites with the versions the reviews applied, and records a section that changed
   (docs/framing-review.md, "Guideline versions").
2. If nothing changed, it stops. Otherwise it validates the events, runs the unit tests and opens a pull request whose description starts with the
   guideline sections that changed (with their changed lines), then lists the title changes, the held title cases, and, for each changed lead, the
   removed and added sentences. It never merges.
3. **Before merging**, read that list. Changes in wording and titles are Wikipedia's; the point of reading is to spot vandalism or a lead that was rewritten wholesale.
   For a changed guideline, the question is whether the edit changes what the wording check flags; if so, redo that part of the review.
4. After merging, the site rebuilds itself, including the search index (Pagefind, built from `data/events.json`), so search uses the new titles and text. The framing review of each changed summary shows "may no longer
   apply" until it is re-reviewed.

To run it by hand instead: `node scripts/refresh-extracts.js --report=refresh-report.md` (dry run, default, writes nothing), then add `--apply` to write the changes
(leads and titles).
Add `--proposed` to also refresh `data/events.proposed.json`.

### Titles

`title` is the **current** English Wikipedia article title, and articles get renamed (for example "2023 Israel–Hamas war" is now "Gaza war").
Titles follow Wikipedia the same way summaries do. The refresh run compares each event's title and URL with the article the API resolves
(`redirects=1`). A dry run only lists the differences; `--apply` (which the monthly workflow uses) writes the plain renames, so they arrive in the same
pull request as the changed summaries. A plain rename is one where the stored URL redirects to the renamed article, or the URL is current and Wikipedia
redirects the stored title to that same article. It changes `title`, `wikipedia_url` (only when the stored URL is a redirect) and drops the then-moot
`title_differs_from_article` flag. Event ids never change, so deep links keep working, and a rename that would give two events the same title is not applied.

Anything else is **held**: never applied, only listed in the run's report (the pull request description) for a person to judge. Held cases are a redirect
to a section of a larger article, an article whose Wikidata item is not the event's, or a stored title that Wikipedia does not redirect to the article
(usually a hand-picked label for an event whose URL points at a broader article).

## Licensing of the source data

Wikipedia text is CC BY-SA 4.0; Wikidata is CC0. See `data/LICENSE` and `NOTICE`.
