"""
Market-data + analyst-consensus client (the data SEC does NOT provide).

Sources, in order of preference:
  * yfinance (Yahoo Finance, unofficial) — quote, market cap, EV, the multiples Yahoo
    pre-computes, analyst price targets, forward EPS consensus, and the buy/hold/sell
    distribution across the covering analysts. This is the accessible proxy for
    "what Wall Street thinks": ~40-60 analysts including the bulge-bracket banks.
    True per-bank research notes (e.g. a specific Morgan Stanley price target) live in
    paid feeds (Refinitiv/IBES, FactSet, Bloomberg) and are NOT pulled here.
  * stooq — free no-key CSV close price, used as a fallback if Yahoo fails.

Every pull is cached to data/raw/market/<TICKER>.json WITH an `as_of` timestamp, because
unlike SEC filings this data is live and point-in-time. Pass refresh=True to re-pull.
"""
from __future__ import annotations

import json
import urllib.request
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
MKT_DIR = ROOT / "data" / "raw" / "market"

_INFO_FIELDS = [
    "currentPrice", "regularMarketPrice", "marketCap", "sharesOutstanding",
    "enterpriseValue", "trailingPE", "forwardPE", "priceToBook", "trailingEps",
    "forwardEps", "dividendYield", "trailingAnnualDividendYield", "enterpriseToEbitda",
    "enterpriseToRevenue", "targetMeanPrice", "targetHighPrice", "targetLowPrice",
    "targetMedianPrice", "recommendationKey", "recommendationMean",
    "numberOfAnalystOpinions", "beta", "fiftyTwoWeekHigh", "fiftyTwoWeekLow",
]


def _stooq_close(ticker):
    url = f"https://stooq.com/q/l/?s={ticker.lower()}.us&f=sd2t2ohlcv&h&e=csv"
    try:
        raw = urllib.request.urlopen(url, timeout=15).read().decode()
        line = raw.strip().splitlines()[1].split(",")
        return {"close": float(line[6]), "date": line[1]}
    except Exception:
        return None


def fetch_ticker(ticker: str) -> dict:
    """Pull a point-in-time market + consensus snapshot for one ticker."""
    out = {"ticker": ticker, "as_of": datetime.now(timezone.utc).isoformat(timespec="seconds")}
    try:
        import yfinance as yf
        t = yf.Ticker(ticker)
        info = {}
        try:
            info = t.info or {}
        except Exception:
            info = {}
        out["info"] = {k: info.get(k) for k in _INFO_FIELDS}

        # explicit analyst consensus blocks (more reliable than info.* alone)
        try:
            out["price_targets"] = t.get_analyst_price_targets()
        except Exception:
            out["price_targets"] = None
        try:
            ee = t.earnings_estimate  # forward EPS consensus by horizon
            out["earnings_estimate"] = json.loads(ee.reset_index().to_json(orient="records")) if ee is not None and not ee.empty else None
        except Exception:
            out["earnings_estimate"] = None
        try:
            rec = t.recommendations  # buy/hold/sell counts by month
            out["recommendations"] = json.loads(rec.to_json(orient="records")) if rec is not None and not rec.empty else None
        except Exception:
            out["recommendations"] = None
    except Exception as e:
        out["error"] = repr(e)[:200]

    # price fallback / sanity
    price = (out.get("info") or {}).get("currentPrice") or (out.get("info") or {}).get("regularMarketPrice")
    if not price:
        sc = _stooq_close(ticker)
        if sc:
            out["stooq"] = sc
            out.setdefault("info", {})["currentPrice"] = sc["close"]
    return out


def get_market(ticker: str, refresh: bool = False) -> dict:
    MKT_DIR.mkdir(parents=True, exist_ok=True)
    cache = MKT_DIR / f"{ticker}.json"
    if cache.exists() and not refresh:
        return json.loads(cache.read_text(encoding="utf-8"))
    data = fetch_ticker(ticker)
    cache.write_text(json.dumps(data, indent=2), encoding="utf-8")
    return data


def main(refresh=True):
    companies = json.loads((ROOT / "config" / "companies.json").read_text(encoding="utf-8"))["companies"]
    for c in companies:
        d = get_market(c["ticker"], refresh=refresh)
        info = d.get("info", {})
        pt = d.get("price_targets") or {}
        print(f"{c['ticker']:6} px={info.get('currentPrice')} mktcap=${(info.get('marketCap') or 0)/1e9:.0f}B "
              f"trailPE={info.get('trailingPE')} fwdPE={info.get('forwardPE')} "
              f"target_mean={pt.get('mean')} rec={info.get('recommendationKey')} n={info.get('numberOfAnalystOpinions')}")


if __name__ == "__main__":
    main()
