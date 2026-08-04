# Data sourcing playbook

Hard-won order of operations. Deviating from it wastes a lot of time.

## Transcripts

**Do not call FMP `earningsTranscript`.** Every endpoint on it is gated behind Ultimate/Enterprise
and this account does not have it. It fails with a plan error, not a helpful message.

Try in this order and stop at the first that works:

1. **Official investor-relations transcript.** Best possible sourcing — quote it and say so, because
   "官方逐字稿" is itself a credibility signal. Many large caps host these on Q4 Inc's CDN:
   `https://s21.q4cdn.com/<id>/files/doc_financials/<year>/<q>/<TICKER>-<Q>-<YEAR>-Earnings-Call-Transcript.pdf`
   Find the URL with `WebSearch "<company> Q<n> <year> earnings call transcript"` — the IR PDF
   usually appears in the results directly.
2. **Motley Fool** — `fool.com/earnings/call-transcripts/...`, free and complete.
3. **Globe and Mail** or **MarketScreener** — good for a second source when verifying attribution.
4. **investing.com** `/news/transcripts/...` — works, but is an edited write-up, so treat quotes
   from it as needing confirmation elsewhere.

Seeking Alpha and GuruFocus are paywalled; roic.ai returns 403. Do not waste calls on them.

### Reading PDFs

`WebFetch` on a transcript PDF will report that it cannot parse the binary — **this is not a
failure**. It saves the file locally and prints the path in the tool result. Take that path and use
`Read` with the `pages` parameter (maximum 20 pages per call; a typical transcript is 15–25 pages,
so it is one or two calls). This yields the true verbatim text, which is strictly better than any
summariser output.

For HTML transcripts, `WebFetch` with a long, explicit extraction prompt works well: ask for verbatim
quotes with speaker attribution, every guidance number, and the notable Q&A exchanges, and tell it
not to paraphrase numbers.

### How many quarters

Two by default. Three or four when the angle is a trajectory — capex, gross margin, TAM, or guidance
that gets revised every quarter. Two quarters shows one delta; three shows whether it is accelerating.

The highest-value material in a two-quarter read is the **arc**: something management said was
impossible or unfunded in Q(n-1) that they announce as done in Q(n). Look for these deliberately.
They are invisible to anyone reading a single quarter, which is exactly why they are worth the work.

## Market data

**stockanalysis.com/stocks/<ticker>/** via WebFetch, for: current price and date, market cap and its
one-year change, trailing PE, forward PE, TTM EPS, TTM revenue, and the 52-week range. Ask for all of
it in one prompt. The 52-week range and the trailing-vs-forward PE relationship both routinely carry
the story.

**FMP** for the ratios stockanalysis does not surface cleanly:
- `statements` → `metrics-ratios-ttm` and `key-metrics-ttm`: P/FCF, operating cash flow per share,
  capex per share, free cash flow per share, gross and operating and net margin, P/S, P/B.
- `calendar` → `earnings-calendar` (date range) for scouting, `earnings-company` for one ticker's
  history and the consensus EPS and revenue estimates for the upcoming quarter.
- `quote` endpoints are plan-locked on this account; get price from stockanalysis instead.

Derived figures worth computing every time, because they are the ones nobody else publishes:
- **capex as a share of operating cash flow** = capex per share ÷ OCF per share. Anything above ~60%
  means the company has become capital-intensive regardless of what its PE says.
- **implied remaining quarterly capex** = (full-year guidance − year-to-date actual) ÷ quarters left.
  Compare to the last reported quarter. A large gap is a clean, checkable prediction.

## Currency and unit traps

- TSMC reports in NT$ and guides in US$. Use the figure management stated on the call and say which.
  FMP's per-share TSM values are unreliable; its ratios are fine.
- Non-GAAP quarterly gross margin and TTM gross margin are different bases. If both appear in a post,
  label them. Intel's Q2 non-GAAP 41.8% next to a TTM 38.9% is correct but needs the label.
- Capex guidance may or may not include finance-lease principal payments. Meta's does. Confirm the
  actual and the guidance are on the same basis before computing a run-rate from them.
