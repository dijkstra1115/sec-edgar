---
name: earnings-post
description: Draft Traditional-Chinese Threads posts about US stocks from earnings-call transcripts, in the user's established 資工宅 voice. Use when asked to write a post about a company's earnings ("幫我寫一篇 NVDA", "/earnings-post META"), to pick which company to cover next, or to produce the post-earnings 對答案 follow-up. Covers transcript acquisition, cross-source fact-checking, peer triangulation via a local claims ledger, and the valuation reality-check close.
---

# earnings-post

Produce a Threads post in the user's voice from primary-source earnings-call transcripts.
The moat is **translation + verified primary sources**, not information access. Transcripts are
free and infinite; the ability to read them and render them as narrative is scarce. Every factual
claim in the output must trace back to a transcript line or a quoted market-data source.

Read `references/voice.md` before writing any prose. Read `references/sources.md` before fetching
anything. Read `references/factcheck.md` before finalising. These are not optional.

## Modes

| Invocation | Mode | What it does |
|---|---|---|
| `/earnings-post TICKER` | **pre** (default) | Pre-earnings 小抄. Requires earnings within ~10 days. |
| `/earnings-post TICKER --post` | post | Post-earnings 解讀 of the just-reported quarter. |
| `/earnings-post` | scout | Scan the calendar, propose 3 ranked candidates, stop. |
| `/earnings-post TICKER --review` | review | 對答案 follow-up against a stored checklist. |

**pre is the strongest format** and the default: it drives saves, creates a return hook, and is
self-verifying after the fact. Only use `post` when the user asks or when no covered name reports soon.

## Pipeline

### Preflight — run once per session, before stage 0

Check whether the FMP MCP server is reachable: `ToolSearch` for `fmp calendar`. If no FMP tools come
back, it is not configured in this environment.

When it is missing, tell the user **once**, in one line, and keep going:

> FMP MCP 沒裝，這次走網路來源（選股和 TTM 現金流比率會比較粗）。要裝的話：
> `claude mcp add --transport http fmp "https://financialmodelingprep.com/mcp?apikey=<YOUR_KEY>"`

Do not block, do not ask permission, do not offer to install it mid-run. Every stage has a working
fallback and a complete post can be produced with no MCP at all — the notice exists so the user knows
they are running degraded, not so they have to fix it first.

Also confirm `drafts/` and `drafts/ledger/` exist; create them if not. An absent or empty ledger on a
fresh clone is expected and is not an error — it only means stage 4 has nothing to draw on yet.

`scripts/post_context.py` needs no MCP and no network. On a fresh clone its sections will report
that the alert logs and dataset have not been built yet; that is expected and it still runs.

### 0. Scope

**Start here, always:**

```
python scripts/post_context.py TICKER      # one name
python scripts/post_context.py --scout     # no ticker given
```

This is the bridge to the rest of the repo. It reports what the user's own alert system has
already flagged, the latest 13F institutional flow, and the curated valuation row — material no
public source has. Run it before touching the web.

- Ticker given → confirm the next (pre) or last (post) earnings date. Ticker absent → scout mode.
- **pre** requires earnings within ~10 days. If further out, say so and offer scout mode instead.
- Scout output ranks watchlist names by alert volume. **Cross that against the FMP earnings
  calendar and pick the overlap**: a name the user's own system keeps flagging *and* that reports
  soon. That intersection is the strongest possible topic signal, because it means the interest is
  already demonstrated rather than assumed.
- Also favour a technical angle the user's CS background can exploit, and a name with prior ledger
  coverage (cheap peer callbacks).
- If `post_context` reports the ticker is **not on the watchlist**, say so once: there will be no
  alert history, no flow and no curated financials, so the post leans entirely on the transcript.
  Consider suggesting the user add it to `config/companies.json`.

### 1. Acquire transcripts
Follow the source chain in `references/sources.md` exactly. Summary:
- **Never** use FMP `earningsTranscript` — plan-locked for this account.
- Order: official IR PDF → Motley Fool → Globe and Mail / MarketScreener → investing.com.
- PDFs: `WebFetch` the URL (it fails to parse but **saves the binary locally and prints the path**),
  then `Read` that path with `pages` (20 max per call). Do not skip Q&A — the best material lives there.
- **Quarters: 2 by default.** Extend to 3–4 when the angle is a *trajectory*: capex, gross margin,
  TAM, or repeatedly revised guidance. Two quarters gives one delta; three gives you acceleration.

### 2. Extract and log
Pull verbatim quotes (with speaker + role + quarter), all guidance figures, segment numbers, and
KPI deltas. Append every one to the ledger — see `references/ledger.md`. Logging is not optional:
the ledger is what makes stage 4 cheap, and it compounds across runs.

### 3. Fact-check gate
Run `references/factcheck.md` in full before any prose is written. Nothing ships unverified.

### 4. Peer context
Query the ledger for the three moves that single-company analysis cannot produce:
- **Triangulation** — same theme, different companies, ~90-day window. Competitors with no incentive
  to collude saying the same thing is the single highest-impact structure available.
- **Comparative valuation** — the target's ratio only means something next to a peer's.
- **Supply-chain read-through** — one company's capex is another's revenue.

### 5. Valuation (照妖鏡)

**The repo's own numbers come first** — they are the differentiated ones. From stage 0's
`post_context` output you already have:

- **Institutional flow (13F)** — the single most under-used asset here. "Institutions net sold
  $92.7bn of NVDA last quarter while adding $7.1bn of INTC" is a sentence no other zh-TW writer
  is producing, and it is a *fact from a filing*, not an opinion.
- **Curated valuation** — price, market cap, trailing PE, forward PE (both consensus and Yahoo,
  which often disagree — say so when they do), P/S, P/B, EV/EBITDA, FCF yield, TTM FCF, TTM net
  income, analyst target upside.

Check the `as_of` date. If `post_context` prints a staleness warning, **rebuild before quoting**:

```
cd src && python market_client.py && python build_dataset.py
```

Then fill gaps from the web: 52-week range and per-share cash-flow detail (OCF per share, capex
per share) from stockanalysis.com or FMP `statements metrics-ratios-ttm`.

Two checks that are mandatory because they have repeatedly found the real story:
- **Is the E real?** Search the transcript for a CFO "absent the…" / "excluding…" construction.
  One-time tax benefits and unrealized equity gains inflate TTM EPS and make PE look cheap.
- **Forward PE vs trailing PE direction.** For a growing company, forward should be *lower*.
  If it is higher, the TTM base is inflated or forward earnings are being compressed. Say which.

### 6. Write
Six-part structure, per `references/voice.md`. All six parts, every time — part 6 is the one the
user historically omits and it is the highest-trust element.

### 7. Emit
Three files, all under `drafts/`:
- `drafts/plain/<ticker>.txt` — the post. Plain text, ready to paste. No markdown, no em dashes.
- `drafts/<ticker>_<YYYY-MM-DD>.md` — editor's notes: sources, what was read, the claims most likely
  to be challenged and how to defend them, and every blank the user must fill.
- `drafts/followups/<ticker>_<earnings-date>.json` — the falsifiable checklist for `--review`.

### 8. Review mode
Read the stored checklist, fetch actual results and the new transcript, mark each item hit or miss
(including the ones that went against the call — that is the point), and write the follow-up post.
Close it with a hook to the next covered name's earnings date.

## Hard rules

1. **Never invent a word count.** The signature opener cites transcript length. If the real number
   is unknown, use a labour signal that is true ("連 Q&A 每一題都對過") instead of a fabricated figure.
2. **Never fill in a position.** Always leave `〔此處填你自己的實際持倉／操作〕`. Stating a trade the
   user did not make is a fabrication with money attached.
3. **Every number traceable.** If a figure cannot be tied to a transcript line or a named market-data
   source, it does not go in the post.
4. **Verbatim quotes, correct attribution.** Confirm the speaker against a second source. Getting
   CFO and CEO backwards discredits the whole piece.
5. **Verify product and technology names.** See the incident log in `references/factcheck.md`.
6. **When unsure, mark it.** Write 「需查證」 in the editor's notes rather than guessing. A single
   outsider-level error reads as "he had an AI write it" and costs more than the paragraph is worth.

## Environment

Works fully with the FMP MCP server configured; degrades gracefully without it.

| Need | Primary | Fallback if no MCP |
|---|---|---|
| Alert history, 13F flow, curated valuation | `scripts/post_context.py` (local, no network) | none needed |
| Earnings calendar | FMP `calendar` | WebSearch "<ticker> earnings date" / investor relations page |
| Transcripts | WebFetch + Read (no MCP needed) | same |
| Price, PE, 52w range | `post_context`, then stockanalysis.com for the 52w range | same |
| TTM ratios (P/FCF, capex/OCF) | FMP `statements metrics-ratios-ttm` | stockanalysis.com financials tab |

If FMP is absent in a fresh environment, add the official remote server:

```
claude mcp add --transport http fmp "https://financialmodelingprep.com/mcp?apikey=<YOUR_KEY>"
```

Two gotchas worth knowing before debugging: the account's API key is `/stable`-only, so local stdio
FMP servers that hardcode `/api/v3` return 403 — use the official remote endpoint. And
`earningsTranscript` is plan-locked regardless of how the server is configured.

Transcripts and market data need no MCP at all, so a fresh clone with zero setup can still produce a
complete post; only the scouting calendar and the TTM cash-flow ratios need the fallbacks above.

If `drafts/` or the ledger do not exist yet (fresh clone), create them. An empty ledger only means
stage 4 has nothing to draw on for the first couple of runs; it is not an error.
