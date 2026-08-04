# Claims ledger

`drafts/ledger/claims.jsonl` — one JSON object per line, append-only.

A single file rather than one per company, because the whole point is cross-company queries. JSONL
so it stays greppable and diffable. It lives under `drafts/` so it inherits that directory's
gitignore status.

## Schema

```json
{
  "ticker": "META",
  "company": "Meta Platforms",
  "fiscal_period": "Q1 2026",
  "call_date": "2026-04-29",
  "speaker": "Susan Li",
  "role": "CFO",
  "quote_en": "verbatim, character for character",
  "gloss_zh": "中文意譯，可留空",
  "topics": ["capex", "custom-silicon"],
  "numbers": {"capex_fy2026_guide_usd_b": [125, 145]},
  "source_url": "https://...",
  "source_type": "official_ir_pdf"
}
```

- `fiscal_period` uses the company's own fiscal labelling, not the calendar quarter.
- `speaker` empty and `role` `"analyst"` is valid — analyst questions are often the best material,
  but must never be attributed to the company.
- `source_type`: `official_ir_pdf` | `motley_fool` | `globe_and_mail` | `investing_com` | `market_data`.
- `numbers` is free-form; prefer explicit key names with units baked in.

## Topic vocabulary

Keep tags consistent or cross-company queries silently miss. Current set:

`capex` · `supply-constraint` · `packaging` · `custom-silicon` · `foundry` · `memory` ·
`gross-margin` · `depreciation` · `inference-cost` · `recommendation-models` · `ad-pricing` ·
`cloud-backlog` · `tpu` · `agentic-ai` · `headcount` · `guidance` · `valuation`

Add new tags when needed and record them here.

## Query patterns

**Triangulation** — the highest-value move. Same topic, different tickers, within ~90 days:

```
grep '"supply-constraint"' drafts/ledger/claims.jsonl
```

Three competitors with no incentive to collude making the same claim in the same window is an
argument no single-company analysis can produce. When using it, still acknowledge the obvious
counter — shortage talk benefits all of them — and point at capex follow-through as the tell.

**Callback** — has this company said something contradictory before?

```
grep '"ticker": "META"' drafts/ledger/claims.jsonl
```

The two-quarter arc (impossible in Q(n-1), shipped in Q(n)) is found this way.

**Comparative valuation** — pull `market_data` rows for peers to put a ratio in context.

## Discipline

Log during extraction, not after writing. If it is logged only when it makes the post, the ledger
becomes a record of one person's narrative instead of a record of what was said — and it stops being
useful for finding the contradiction that makes the next post.

Cold start is expected. The first two runs have nothing to draw on; that is not an error.
