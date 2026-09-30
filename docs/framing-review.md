# Framing review: how we check the Wikipedia summaries

Every event on the map shows the lead section of its English Wikipedia article, unchanged. Below that text the event page shows a **framing review**: one list of findings about how the summary is written, with the words in question highlighted in the text. This page explains how findings are made, who made them, and how to challenge one.

## What it is and is not

- It reviews **how the summary is written, not whether the events happened**. It does not say who was to blame.
- There is **no score and no verdict on which side a summary favours**. The review lists what it found; readers judge what it means.
- It **never changes, hides or reorders** the Wikipedia text. The text is shown exactly as Wikipedia gives it, and the review sits in a separate, labelled box.
- It is shown for **every** event, including the ones where nothing was found. Research on warning labels finds that when only some items carry a label, readers tend to treat the unlabelled ones as checked and accurate ([Pennycook et al., 2020](https://pubsonline.informs.org/doi/10.1287/mnsc.2019.3478)), so a "nothing found" result is shown as deliberately as a flag.

## Two kinds of finding

Each finding is one of two kinds, labelled on the page:

- **Wording**: the summary's wording departs from one of **Wikipedia's own neutrality and wording guidelines**. The finding names the guideline and links to it, so anyone can check whether it was applied fairly.
- **Fairness**: our **judgement** of what no word list can catch, such as emphasis, a story told only from one side, or what the summary leaves out. There is at most one per summary.

The review combines two passes over every summary: a judgement of overall fairness (27 September 2026) and a check of the wording against Wikipedia's guidelines (30 September 2026). Their results are merged into one list: where both passes found the same problem it appears once, as a wording finding, and anything only one pass caught is kept.

## Wording findings

A wording finding is made only when the words are **in Wikipedia's own voice**. Words inside a quotation, or attributed to someone ("Israel said", "according to Human Rights Watch", "described by Qatar as"), are not flagged: attribution is exactly what the guidelines ask for.

| Guideline | What is flagged |
|---|---|
| [Contentious labels](https://en.wikipedia.org/wiki/Wikipedia:Manual_of_Style/Words_to_watch#Contentious_labels) (MOS:LABEL) | The value-laden labels the guideline lists, such as *terrorist*, *extremist*, *fundamentalist* and *denialist*, and their direct variants (*terror attack*, *denialism*). The guideline asks for in-text attribution of these words. This applies to every side: it flags "terrorist" for the Irgun, for Palestinian groups, for ISIS and for Kurdish militants alike. |
| [Editorializing](https://en.wikipedia.org/wiki/Wikipedia:Manual_of_Style/Words_to_watch#Editorializing) (MOS:EDITORIAL) | Listed words such as *indeed*, *clearly*, *of course*, *although*, *despite* when they steer the reader toward one side's account, and sentences that add an argument in Wikipedia's own voice. |
| [Expressions of doubt](https://en.wikipedia.org/wiki/Wikipedia:Manual_of_Style/Words_to_watch#Expressions_of_doubt) (MOS:DOUBT) | *Purported*, *supposed*, *so-called* and scare quotes that cast doubt on one side's account. |
| [Synonyms for "said"](https://en.wikipedia.org/wiki/Wikipedia:Manual_of_Style/Words_to_watch#Synonyms_for_said) (MOS:SAID) | Verbs that imply doubt or truth (*claimed*, *refuted*, *admitted*). Because Wikipedia uses "claimed" constantly, it is flagged only when **used unevenly**: the same summary gives one party's statement "claimed" and a comparable statement by another party a neutral verb ("said", "stated", "according to"). |
| [Puffery](https://en.wikipedia.org/wiki/Wikipedia:Manual_of_Style/Words_to_watch#Puffery) (MOS:PUFFERY) | Listed praise words (*remarkable*, *celebrated*) applied to one party. |
| [Avoid stating opinions as facts](https://en.wikipedia.org/wiki/Wikipedia:Neutral_point_of_view#Explanation) (WP:YESPOV) | A contested characterisation of what an event *is* (genocide, ethnic cleansing, revolution or coup) stated in Wikipedia's own voice. The note says what the summary itself does about the dispute: whether it attributes the characterisation to anyone, and whether it gives the other side's position. |

Deciding which characterisations are contested uses the reviewer's general knowledge; the note itself only describes what the text says. The guidelines' word lists are examples, not complete lists; to keep the review predictable, only the words they name, and their direct variants, are flagged. Words such as *liberation*, *regime*, *murdered* or *neo-fascist* can feel loaded but are not on the lists, so they are not flagged as wording (a fairness finding may still mention them).

## Fairness findings

A fairness finding covers one-sidedness that is not in any single listed word: emphasis, whose point of view a story is told from, contested claims about two parties treated differently, or something important left out. It is labelled as a judgement. Some fairness findings draw on the reviewer's general knowledge (for example, which death tolls most sources give) and may say so.

## Not judged

- **Legal descriptions** such as *occupied*, *annexed* or *illegal*. Deciding whether they are right is a legal question, not a wording one.
- **Whether a fact is true.** A fairness finding may point out that a contested claim is stated as fact, but the review does not settle the dispute.
- **Names of other events.** "During the Armenian genocide" or "the Gaza genocide" used as the name of another event is not re-judged; that label is reviewed in the other event's own entry.
- **Vague attributions** ("it is believed", "has been described as"). Wikipedia's guideline on [unsupported attributions](https://en.wikipedia.org/wiki/Wikipedia:Manual_of_Style/Words_to_watch#Unsupported_attributions) is about vague sourcing rather than taking sides, and applying it would flag hundreds of ordinary sentences.

## Who reviewed it

All 571 summaries were reviewed by **Claude (model `claude-opus-5-5`), an AI model made by Anthropic**. No person has checked every review line by line. One summary (the 2026 Minab school attack) mentions Claude itself as part of a US military targeting system, so the reviewer has a connection to that entry's subject; its review says so. The reviews are stored in [`data/framing-review.json`](../data/framing-review.json), one entry per event.

## How it shows on the event page

- **A short notice above the text** says how many issues were found and that the words are highlighted, with a link to the review. It never says how biased a summary is or toward whom.
- **The words in question are highlighted** in the Wikipedia text. Selecting a highlight jumps to the review. The words themselves are never changed. A phrase is highlighted only if it appears word for word in the exact text that was reviewed; if Wikipedia's text has changed since, the highlights are dropped and the review is marked as possibly out of date.
- **The review box below the text** shows "N issues found" (or "Nothing found") and lists each finding with its kind: wording findings with the guideline, the quoted words and a one-line note; the fairness finding as a short note. Any category note, data note or disclosure follows.

## Results

| | Summaries |
|---|---|
| At least one finding | 136 of 571 |
| With a wording finding | 78 |
| With a fairness finding | 68 |

| Guideline | Wording findings |
|---|---|
| Contentious labels | 46 |
| Synonyms for "said" | 19 |
| Avoid stating opinions as facts | 12 |
| Editorializing | 8 |
| Expressions of doubt | 4 |
| Puffery | 1 |

We do not publish counts of which side the findings favour. An earlier version (27 September 2026) did: it rated each summary 0-3 with a direction and reported that of 153 Israel/Palestine summaries, 34 were flagged, 28 of them leaning toward the Palestinian side and 1 toward the Israeli side. That figure was withdrawn because it depended heavily on the rules chosen (under reasonable alternative rules it moved to 13 to 9), so it said more about the rules than about Wikipedia.

## Limits

- **One reviewer.** Every review is applied by a single AI model. Another careful reader could apply the same guidelines differently.
- **English Wikipedia only.** Other language editions frame many of these events differently; the review does not compare them.
- **A snapshot.** Wikipedia text changes. Each entry stores a fingerprint of the exact text reviewed; when the text shown no longer matches, the event page says the review may no longer apply until it is redone.
- **Not a balance of sources.** The review only describes the summary shown. It does not add the other side's account, because choosing and wording that account would itself be an editorial act.

## Disagree with a review?

Each review box has a "Disagree with this review?" link that opens a GitHub issue for that event. Please say what is wrong and point to the text or the guideline. A disputed review is re-read, and any change is recorded in the history of `data/framing-review.json`. If the problem is in the Wikipedia text itself, the lasting fix is on Wikipedia: the next data refresh picks up the new text, and the review of that event is then redone.
