# Framing review: how we rate the Wikipedia summaries

Every event on atlas.wiki shows the lead section of its English Wikipedia article, unchanged. Under that text the event page shows a **framing review**: our own short reading of whether the summary tells the story from one side. This page explains what the review is, who wrote it, and how to challenge it.

## What it is and is not

- It is **our opinion** of how the summary is framed. It is not Wikipedia's view, and it is not a fact-check of the events.
- It **never changes, hides or reorders** the Wikipedia text. The text is shown exactly as Wikipedia gives it, and the review sits in a separate, labelled box.
- It is shown for **every** event, including the ones where we found nothing. Research on warning labels finds that when only some items carry a label, readers tend to treat the unlabelled ones as checked and accurate ([Pennycook et al., 2020](https://pubsonline.informs.org/doi/10.1287/mnsc.2019.3478)), so a "no one-sided framing found" result is shown as deliberately as a flag.
- A rating is about **framing, not truth**. A summary can be accurate in every fact and still tell only one side, and a rating of "states a contested conclusion as fact" means that major states, courts or scholars disagree with the conclusion, not that we think it is false.

## Who reviewed it

All 594 summaries were read in full, in date order, on 27 September 2026 by **Claude (model `claude-opus-5-5`), an AI model made by Anthropic**. No person has checked every rating line by line. One consequence is worth stating plainly: one summary (the 2026 Minab school attack) mentions Claude itself as part of a US military targeting system, so the reviewer has a connection to that entry's subject; its note says so.

The ratings are stored in [`data/framing-review.json`](../data/framing-review.json), one entry per event.

## The scale

| Rating | Label shown | Meaning |
|---|---|---|
| 0 | No one-sided framing found | A plain summary, or a contested event where each side's claims are attributed to them. |
| 1 | Minor lean | A loaded word used as fact, a missing counterpart view, a single-source or top-of-range figure, or a story told only from one side's vantage point. |
| 2 | Leans to one side | The framing favours one party across the whole summary, or a fringe claim gets extended space. |
| 3 | States a contested conclusion as fact | The summary's defining sentence presents a conclusion that major parties dispute as settled, without saying who holds it. |

Each rated entry also names **which way it leans** where there is a clear direction (for example "Toward the Iranian side"), and gives a one-sentence reason quoting the words that led to the rating. The reason matters more than the number: explained notes are trusted more than bare labels by readers across the political spectrum ([Drolsbach et al., 2024](https://academic.oup.com/pnasnexus/article/3/7/pgae217/7686087)).

### How a flag shows on the event page

A flagged summary is never shown without its flag:

- **A notice above the text** says the summary was flagged and how strongly.
- **The words in question are highlighted** inside the Wikipedia text: a tinted, underlined mark whose colour follows the rating. Selecting a mark jumps to the review that explains it. The highlights are always on; the words themselves are never changed, only marked. Every occurrence of a flagged phrase is marked.
- **Some flags have no highlight**, because the problem is what the summary leaves out or whose vantage point it takes, not a particular phrase (for example, a battle told entirely from one army's side). The notice then says so.
- A phrase is highlighted only if it appears word for word in the exact text that was reviewed. If Wikipedia's text has changed since, the highlights are dropped and the review is marked as possibly out of date.

Separate from the framing rating, some events carry:

- a **category note**, when our own colour/filter group ("Category (our grouping)") could mislead, for example because it follows a Wikidata type the summary itself calls disputed;
- a **data note**, when a date or country tag from Wikidata is wrong, or the summary comes from a different article than the event's title.

## Results

| Rating | Events |
|---|---|
| No one-sided framing found | 515 |
| Minor lean | 68 |
| Leans to one side | 8 |
| States a contested conclusion as fact | 3 |

The flags are not evenly spread. Of the 170 events tagged Israel/Palestine, 34 are rated above 0: 28 lean toward the Palestinian side or against Israel, 1 leans toward the Israeli side, and the rest are British-side accounts of World War I battles or have no clear direction. Across the whole dataset, 2 entries lean toward the Israeli side. All three entries rated 3 (Nakba, Gaza genocide, and the Israeli blockade of the Gaza Strip since 2023) are in this group. Other recurring patterns: the World War I Sinai and Palestine battles are told from the British side, the Iran–Iraq war operations from the Iranian side, and the Syrian civil war entries as an opposition victory story.

We report this imbalance because it is what the review found in the current English Wikipedia text, not because we set out to find it. Readers on every side of a conflict tend to see neutral coverage as biased against them ([Vallone, Ross & Lepper, 1985](https://en.wikipedia.org/wiki/Hostile_media_effect)), and a review is not exempt from that, so the ratings are published with their reasons for anyone to check.

## Limits

- **One reviewer.** Every rating is a judgement call by a single AI model. Another careful reader could rate some entries differently.
- **English Wikipedia only.** Other language editions frame many of these events differently; the review does not compare them.
- **A snapshot.** Wikipedia text changes. Each entry stores a fingerprint of the exact text reviewed; when the text shown no longer matches, the event page says the rating may no longer apply until it is reviewed again.
- **Not a balance of sources.** The review only describes the summary shown. It does not add the other side's account, because choosing and wording that account would itself be an editorial act.

## Disagree with a rating?

Each review box has a "Disagree with this rating?" link that opens a GitHub issue for that event. Please say what is wrong and point to a source. A disputed rating is re-read, and any change is recorded in the history of `data/framing-review.json`. If the problem is in the Wikipedia text itself, the lasting fix is on Wikipedia: the next data refresh picks up the new text, and the review of that event is then redone.
