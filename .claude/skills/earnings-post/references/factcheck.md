# Fact-check gate

Run every item before writing prose. The entire format rests on one promise — 「每一句都對得回逐字稿
原文」 — and a single outsider-level error destroys it retroactively for every past post.

## The gate

1. **Every English quote is verbatim.** Character for character from the transcript. Ellipsis is
   allowed for elision; paraphrase inside 「」 is not.
2. **Every speaker attribution confirmed against a second source.** CEO and CFO say very different
   kinds of things and the credibility difference is real. Confirmed pairings so far:
   TSMC — C.C. Wei (CEO/Chairman), Wendell Huang (CFO).
   Intel — Lip-Bu Tan 陳立武 (CEO), David Zinsner (CFO).
   Meta — Mark Zuckerberg (CEO), Susan Li (CFO).
   Alphabet — Sundar Pichai (CEO), Anat Ashkenazi (CFO), Philipp Schindler (CBO).
3. **Every product, technology and company name checked by search, not by recall.** This cuts both
   ways. Do not assert a name from memory, and do not challenge one from memory either — an
   unfamiliar name is far more likely to be a product released after the knowledge cutoff than a
   fabrication. Search first. Only cut a claim once a search has actually failed to support it.
4. **Every number traceable** to a transcript line or a named market-data source, with the basis
   stated (GAAP vs non-GAAP, quarterly vs TTM, US$ vs local currency).
5. **Arithmetic re-derived**, not asserted. Run-rates, percentages of high and low, ratios.
6. **Same-basis check** before comparing two numbers, especially guidance versus actuals.
7. **Attribution of market reactions to the right day.** An earnings-day move and a move five
   sessions later are different facts. Check the date of any price change cited.
8. **Speaker versus analyst.** Something an analyst said in Q&A is not something the company said.
   Keep the distinction explicit in the prose.

## Incident log

Errors caught while drafting, plus one the assistant got badly wrong in the other direction.

**"NVIDIA Groq 3 LPX" — a false accusation, not a false claim.** The assistant told the user their
published MU post had invented this product, calling it a conflation of Groq the company, xAI's
Grok 3 and NVIDIA's CPX line, and calling the "128GB SRAM per rack" figure physically implausible.
Every part of that challenge was wrong. The product is real: announced at GTC 2026 out of NVIDIA's
$20B licensing and talent deal with Groq, built by Samsung on 4nm, 256 LPUs per rack at 500MB SRAM
each — which is exactly 128GB — alongside 12TB of DDR5. The user's sentence was correct in every
element, including the DDR5 the assistant tried to "fix" to LPDDR5X.

Two causes worth naming. Reasoning from GPU architecture, where on-die SRAM is hundreds of MB, onto
an LPU rack whose entire design premise is aggregate SRAM in place of HBM. And a stale model of who
owns the Groq name, from before the deal.

**The lesson runs opposite to the rest of this file: an unfamiliar product name is not evidence of
fabrication.** Anything plausibly dated after the knowledge cutoff must be treated as
unverifiable-by-memory and searched. Telling an author their published work contains an invented
fact is expensive when wrong — it costs their confidence in the post and in the whole review.

**Intel's −5.86% day (caught in draft).** Nearly written as the earnings-day reaction. It was five
sessions later; the actual post-earnings move was up. Lesson: check the date of every price move.

**Meta's "10% RIF" (caught in draft).** That phrasing came from analyst Youssef Squali in Q&A.
Susan Li only said the company planned to reduce headcount in May. The draft keeps them distinct and
the editor's notes flag it. Lesson: do not upgrade an analyst's characterisation into a company
statement.

**Meta capex run-rate basis (caught before publishing).** The full-year guidance and the Q1 actual
both include finance-lease principal payments, so the run-rate arithmetic is valid — but this was
only true because it was checked. Lesson: verify the basis before dividing.

## Editor's notes requirement

The `.md` deliverable must list, as a table: each claim likely to be challenged, why it is
challengeable, and the recommended defence or hedge. Also list every blank the user must fill and
anything deliberately left out (for example, a word count that was not counted).
