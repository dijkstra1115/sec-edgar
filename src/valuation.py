"""
Valuation layer: fuse SEC fundamentals (our standardized dataset) with live market data
to produce point-in-time valuation multiples AND attach Wall-Street analyst consensus.

Two design choices a professional would insist on:

1. We compute the multiples OURSELVES from transparent inputs (market cap from the quote,
   trailing fundamentals from SEC), rather than just echoing Yahoo's pre-baked ratios.
   Yahoo's equivalents are carried alongside as a cross-check (prefix yf_*). When ours and
   Yahoo's disagree materially, that's a flag to inspect (different TTM window, share class).

2. Trailing-twelve-month (TTM) figures are built from the last 4 quarters, DERIVING the
   un-filed Q4 as FY − (Q1+Q2+Q3). This is the correct trailing base for P/E, EV/EBITDA,
   P/S and FCF yield — not the stale last-annual number.

Market cap uses the QUOTE's market cap (it correctly sums multi-class shares for GOOGL/META,
which SEC's single cover-page share count under-counts). Everything is stamped with the
market data's `as_of`, because unlike a 10-K these numbers move every second.
"""
from __future__ import annotations

import csv
import json
from pathlib import Path

import market_client as mc

ROOT = Path(__file__).resolve().parent.parent
STD = ROOT / "data" / "standardized"
OUT = STD


def _rows():
    return json.loads((STD / "facts_long.json").read_text(encoding="utf-8"))


def _quarter_series(rows, ticker, field):
    """Chronological [(end_date, value)] of standalone quarters, with Q4 derived
    from the annual figure when Q1-Q3 of that fiscal year are present."""
    q = {}   # (fy,fp) -> (end, val)
    ann = {}  # fy -> (end, val)
    for r in rows:
        if r["ticker"] != ticker or r["field_key"] != field or r.get("value") is None:
            continue
        if r["period"] == "quarterly":
            q[(r["fiscal_year"], r["fiscal_period"])] = (r["period_end"], r["value"])
        elif r["period"] == "annual":
            ann[r["fiscal_year"]] = (r["period_end"], r["value"])
    pts = dict(q)
    for fy, (end, fyval) in ann.items():
        q123 = [q.get((fy, f"Q{i}")) for i in (1, 2, 3)]
        if all(x is not None for x in q123):
            pts[(fy, "Q4")] = (end, fyval - sum(v for _, v in q123))
    return sorted(pts.values(), key=lambda x: x[0])


def _ttm(rows, ticker, field):
    """Sum of the trailing 4 quarters; falls back to the latest annual value if a full
    4 quarters aren't available (e.g. SNDK's short post-spin history)."""
    series = _quarter_series(rows, ticker, field)
    if len(series) >= 4:
        return sum(v for _, v in series[-4:]), "ttm_4q"
    ann = [(r["period_end"], r["value"]) for r in rows
           if r["ticker"] == ticker and r["field_key"] == field
           and r["period"] == "annual" and r.get("value") is not None]
    if ann:
        return max(ann, key=lambda x: x[0])[1], "latest_fy"
    return None, None


def _latest_instant(rows, ticker, field):
    cand = [(r["period_end"], r["value"]) for r in rows
            if r["ticker"] == ticker and r["field_key"] == field and r.get("value") is not None]
    return max(cand, key=lambda x: x[0])[1] if cand else None


def _safe_div(a, b):
    return a / b if (a is not None and b not in (None, 0)) else None


def value_ticker(rows, ticker):
    m = mc.get_market(ticker)
    info = m.get("info", {}) or {}
    pt = m.get("price_targets") or {}
    price = info.get("currentPrice") or info.get("regularMarketPrice")
    mktcap = info.get("marketCap")

    ni, ni_basis = _ttm(rows, ticker, "net_income")
    rev, _ = _ttm(rows, ticker, "revenue")
    opinc, _ = _ttm(rows, ticker, "operating_income")
    da, _ = _ttm(rows, ticker, "depreciation_and_amortization")
    cfo, _ = _ttm(rows, ticker, "net_cash_from_operating_activities")
    capex, _ = _ttm(rows, ticker, "capital_expenditures")
    dps, _ = _ttm(rows, ticker, "dividends_per_share")

    equity = _latest_instant(rows, ticker, "total_stockholders_equity")
    cash = _latest_instant(rows, ticker, "cash_and_cash_equivalents") or 0
    sti = _latest_instant(rows, ticker, "short_term_investments") or 0
    debt_st = _latest_instant(rows, ticker, "short_term_debt") or 0
    debt_lt = _latest_instant(rows, ticker, "long_term_debt") or 0
    total_debt = debt_st + debt_lt
    ebitda = (opinc + da) if (opinc is not None and da is not None) else None
    fcf = (cfo - capex) if (cfo is not None and capex is not None) else None
    ev = (mktcap + total_debt - cash - sti) if mktcap is not None else None

    # consensus
    fwd = {e["period"]: e for e in (m.get("earnings_estimate") or [])}
    fy0 = fwd.get("0y", {})
    fy1 = fwd.get("+1y", {})
    recs = (m.get("recommendations") or [{}])[0]
    target_mean = pt.get("mean") or info.get("targetMeanPrice")

    return {
        "ticker": ticker,
        "as_of": m.get("as_of"),
        "price": price,
        "market_cap": mktcap,
        "enterprise_value": ev,
        # multiples we compute transparently from SEC TTM + quote
        "pe_ttm": _safe_div(mktcap, ni),
        "ps_ttm": _safe_div(mktcap, rev),
        "pb": _safe_div(mktcap, equity),
        "ev_ebitda": _safe_div(ev, ebitda),
        "ev_sales": _safe_div(ev, rev),
        "fcf_yield_pct": (round(_safe_div(fcf, mktcap) * 100, 2) if _safe_div(fcf, mktcap) is not None else None),
        "earnings_yield_pct": (round(_safe_div(ni, mktcap) * 100, 2) if _safe_div(ni, mktcap) is not None else None),
        "dividend_yield_pct": (round(_safe_div(dps, price) * 100, 2) if _safe_div(dps, price) is not None else None),
        "ttm_net_income": ni,
        "ttm_net_income_basis": ni_basis,
        "ttm_revenue": rev,
        "ttm_ebitda": ebitda,
        "ttm_fcf": fcf,
        "total_debt": total_debt,
        "net_cash": (cash + sti - total_debt),
        # analyst consensus (the Wall-Street view proxy)
        "analyst_count": info.get("numberOfAnalystOpinions"),
        "recommendation": info.get("recommendationKey"),
        "rec_mean": info.get("recommendationMean"),
        "rec_strong_buy": recs.get("strongBuy"), "rec_buy": recs.get("buy"),
        "rec_hold": recs.get("hold"), "rec_sell": recs.get("sell"), "rec_strong_sell": recs.get("strongSell"),
        "target_mean": target_mean, "target_high": pt.get("high"), "target_low": pt.get("low"),
        "target_upside_pct": (round((target_mean / price - 1) * 100, 1) if (target_mean and price) else None),
        "fwd_eps_cy": fy0.get("avg"), "fwd_eps_cy_growth_pct": (round(fy0.get("growth") * 100, 1) if fy0.get("growth") is not None else None),
        "fwd_eps_ny": fy1.get("avg"), "fwd_eps_ny_growth_pct": (round(fy1.get("growth") * 100, 1) if fy1.get("growth") is not None else None),
        "fwd_pe_consensus": _safe_div(price, fy0.get("avg")),
        # Yahoo's own ratios, carried for cross-check
        "yf_trailing_pe": info.get("trailingPE"), "yf_forward_pe": info.get("forwardPE"),
        "yf_price_to_book": info.get("priceToBook"), "yf_ev_ebitda": info.get("enterpriseToEbitda"),
        "yf_dividend_yield_pct": info.get("dividendYield"),
    }


def main():
    rows = _rows()
    companies = json.loads((ROOT / "config" / "companies.json").read_text(encoding="utf-8"))["companies"]
    res = [value_ticker(rows, c["ticker"]) for c in companies]

    (OUT / "valuation_latest.json").write_text(json.dumps(res, indent=2), encoding="utf-8")
    with open(OUT / "valuation_latest.csv", "w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=list(res[0].keys()))
        w.writeheader()
        w.writerows(res)

    print(f"{'tkr':6}{'price':>9}{'mktcap$B':>10}{'P/E':>8}{'fwdP/E':>8}{'EV/EBITDA':>10}{'FCFyld%':>8}{'target':>9}{'upside%':>8}  rec")
    for r in res:
        def f(x, d=1): return f"{x:.{d}f}" if isinstance(x, (int, float)) else "-"
        print(f"{r['ticker']:6}{f(r['price'],2):>9}{f((r['market_cap'] or 0)/1e9,0):>10}"
              f"{f(r['pe_ttm']):>8}{f(r['fwd_pe_consensus']):>8}{f(r['ev_ebitda']):>10}"
              f"{f(r['fcf_yield_pct']):>8}{f(r['target_mean']):>9}{f(r['target_upside_pct']):>8}  {r['recommendation']}")
    print("\nWrote valuation_latest.json / .csv  (as_of", res[0]["as_of"], "UTC)")


if __name__ == "__main__":
    main()
