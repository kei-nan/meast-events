# Framing review: how we check the Wikipedia summaries

Every event on the map shows the lead section of its English Wikipedia article, unchanged. Under that text the event page shows a **framing review**. It points out where the summary's wording departs from **Wikipedia's own neutrality and wording guidelines**, and, separately, where a reviewer judged that the summary tells the event from one side. This page explains the method, who applied it, what changed, and how to challenge a review.

## What it is and is not

- It checks **wording, not truth**. It does not say whether events happened, whether figures are right, or who was to blame.
- It uses **Wikipedia's rules, not ours**. Each flag names the guideline it relies on and links to it, so anyone can check whether the rule was applied fairly.
- There is **no score and no verdict on which side a summary favours**. A review lists what it found; readers judge what it means.
- It **never changes, hides or reorders** the Wikipedia text. The text is shown exactly as Wikipedia gives it, and the review sits in a separate, labelled box.
- It is shown for **every** event, including the ones where nothing was found. Research on warning labels finds that when only some items carry a label, readers tend to treat the unlabelled ones as checked and accurate ([Pennycook et al., 2020](https://pubsonline.informs.org/doi/10.1287/mnsc.2019.3478)), so a "nothing found" result is shown as deliberately as a flag.

## Who reviewed it

All 571 summaries were reviewed on 30 September 2026 by **Claude (model `claude-opus-5-5`), an AI model made by Anthropic**. No person has checked every review line by line. One summary (the 2026 Minab school attack) mentions Claude itself as part of a US military targeting system, so the reviewer has a connection to that entry's subject; its review says so.

The reviews are stored in [`data/framing-review.json`](../data/framing-review.json), one entry per event.

## Part 1: wording points (Wikipedia's guidelines)

A wording point is flagged only when the words are **in Wikipedia's own voice**. Words inside a quotation, or attributed to someone ("Israel said", "according to Human Rights Watch", "described by Qatar as"), are not flagged: attribution is exactly what the guidelines ask for.

| Guideline | What is flagged |
|---|---|
| [Contentious labels](https://en.wikipedia.org/wiki/Wikipedia:Manual_of_Style/Words_to_watch#Contentious_labels) (MOS:LABEL) | The value-laden labels the guideline lists, such as *terrorist*, *extremist*, *fundamentalist* and *denialist*, and their direct variants (*terror attack*, *denialism*). The guideline asks for in-text attribution of these words. This applies to every side: it flags "terrorist" for the Irgun, for Palestinian groups, for ISIS and for Kurdish militants alike. |
| [Editorializing](https://en.wikipedia.org/wiki/Wikipedia:Manual_of_Style/Words_to_watch#Editorializing) (MOS:EDITORIAL) | Listed words such as *indeed*, *clearly*, *of course*, *although*, *despite* when they steer the reader toward one side's account, and sentences that add an argument in Wikipedia's own voice. |
| [Expressions of doubt](https://en.wikipedia.org/wiki/Wikipedia:Manual_of_Style/Words_to_watch#Expressions_of_doubt) (MOS:DOUBT) | *Purported*, *supposed*, *so-called* and scare quotes that cast doubt on one side's account. |
| [Synonyms for "said"](https://en.wikipedia.org/wiki/Wikipedia:Manual_of_Style/Words_to_watch#Synonyms_for_said) (MOS:SAID) | Verbs that imply doubt or truth (*claimed*, *refuted*, *admitted*). Because Wikipedia uses "claimed" constantly, it is flagged only when **used unevenly**: the same summary gives one party's statement "claimed" and a comparable statement by another party a neutral verb ("said", "stated", "according to"). |
| [Puffery](https://en.wikipedia.org/wiki/Wikipedia:Manual_of_Style/Words_to_watch#Puffery) (MOS:PUFFERY) | Listed praise words (*remarkable*, *celebrated*) applied to one party. |
| [Avoid stating opinions as facts](https://en.wikipedia.org/wiki/Wikipedia:Neutral_point_of_view#Explanation) (WP:YESPOV) | A contested characterisation of what an event *is* (genocide, ethnic cleansing, revolution or coup) stated in Wikipedia's own voice. The note says what the summary itself does about the dispute: whether it attributes the characterisation to anyone, and whether it gives the other side's position. |

Deciding which characterisations are contested for the last row uses the reviewer's general knowledge; the note itself only describes what the text says.

The lists in these guidelines are examples, not complete lists. To keep the review predictable, only the words the guidelines name, and their direct variants, are flagged. Words such as *liberation*, *regime*, *murdered* or *neo-fascist* can feel loaded but are not on the lists, so they are not flagged.

**Not checked:**

- **Legal descriptions** such as *occupied*, *annexed* or *illegal*. Deciding whether they are right is a legal question, not a wording one.
- **Plain factual claims**, including claims about who did what and why. Judging whether a fact is true or disputed is outside the review.
- **Names of other events.** "During the Armenian genocide" or "the Gaza genocide" used as the name of another event is not re-judged; that label is reviewed in the other event's own entry.
- **Vague attributions** ("it is believed", "has been described as"). Wikipedia's guideline on [unsupported attributions](https://en.wikipedia.org/wiki/Wikipedia:Manual_of_Style/Words_to_watch#Unsupported_attributions) is about vague sourcing rather than taking sides, and applying it would flag hundreds of ordinary sentences.

## Part 2: reviewer's notes (judgement)

Some one-sidedness is not in any single word: a battle told entirely from one army's side, or contested claims about two parties treated differently. These are covered by a **reviewer's note**, which is labelled on the page as a judgement rather than a guideline. A note must point to something in the text itself (for example "the Iraqi side appears only as the target") and is not highlighted.

## Second look

The first version of this review (see *History* below) rated the summaries with a different method. Where that method and this one disagree about whether a summary has a problem at all, the review box says the summary is **marked for a second look by a person**. These are the cases where the result depends most on the method, and where a human reviewer is most useful.

## How it shows on the event page

- **A notice above the text** says how many wording points were found and whether there is a reviewer's note. It never says how biased a summary is or toward whom.
- **The quoted words are highlighted** inside the Wikipedia text. Selecting a highlight jumps to the review. The words themselves are never changed. A phrase is highlighted only if it appears word for word in the exact text that was reviewed; if Wikipedia's text has changed since, the highlights are dropped and the review is marked as possibly out of date.
- **The review box** lists each wording point with its guideline, the quoted words and a one-line note, then the reviewer's note, the second-look marker, and any category note, data note or disclosure.

## Results

| | Summaries |
|---|---|
| At least one wording point | 78 |
| Only a reviewer's note | 9 |
| Marked for a second look | 110 |

| Guideline | Wording points |
|---|---|
| Contentious labels | 46 |
| Synonyms for "said" | 19 |
| Avoid stating opinions as facts | 12 |
| Editorializing | 8 |
| Expressions of doubt | 4 |
| Puffery | 1 |

We no longer publish counts of which side the flags favour; see *History* for why.

## History

- **27 September 2026 (version 1, withdrawn).** Each summary got a 0-3 rating, a direction ("leans toward …") and a one-sentence reason, based on the reviewer's overall judgement, including outside knowledge of what courts, historians and governments hold. Results: 492 rated 0, 68 rated 1, 8 rated 2, 3 rated 3. We published that of the 153 Israel/Palestine summaries, 34 were flagged, 28 of them leaning toward the Palestinian side and 1 toward the Israeli side.
- **30 September 2026 (version 3, current).** Version 1 was withdrawn for two reasons:
  - **Some reasons made claims about the outside world that went beyond the sources.** For example, one described the 2024 ICJ advisory opinion as treating Gaza as still occupied; the opinion's actual wording is that Israel's obligations under the law of occupation remain "commensurate with the degree of its effective control over the Gaza Strip".
  - **The side counts depended heavily on the rules chosen.** Re-reviewing all summaries under wording-only rules (an unpublished version 2) changed 92 of 571 ratings. The Israel/Palestine split moved from 28 to 1 to 13 to 9; it would have been about 13 to 1 without the rule on "terrorist". A figure that moves this much with reasonable rule changes says more about the rules than about Wikipedia, so it is no longer published.

  Version 3 checks wording against Wikipedia's own guidelines instead, with judgement confined to separately labelled notes.

## Limits

- **One reviewer.** Every review is applied by a single AI model. Another careful reader could apply the same guidelines differently.
- **English Wikipedia only.** Other language editions frame many of these events differently; the review does not compare them.
- **A snapshot.** Wikipedia text changes. Each entry stores a fingerprint of the exact text reviewed; when the text shown no longer matches, the event page says the review may no longer apply until it is redone.
- **Not a balance of sources.** The review only describes the summary shown. It does not add the other side's account, because choosing and wording that account would itself be an editorial act.

## Disagree with a review?

Each review box has a "Disagree with this review?" link that opens a GitHub issue for that event. Please say what is wrong and point to the text or the guideline. A disputed review is re-read, and any change is recorded in the history of `data/framing-review.json`. If the problem is in the Wikipedia text itself, the lasting fix is on Wikipedia: the next data refresh picks up the new text, and the review of that event is then redone.
