"""
One-off: report the most recent SEC filing date for a set of tickers.

Resolves each ticker to its CIK via SEC's company_tickers.json, then reads the
submissions API and prints the latest filing(s). Helps an analyst see at a glance
whether a company has dropped a new document worth re-ingesting.
"""
from __future__ import annotations

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from sec_client import _fetch_json, get_submissions  # noqa: E402

TICKERS = ["GOOGL", "MSFT", "META", "AMZN", "TSLA", "NVDA", "AVGO", "MRVL",
           "MU", "SNDK", "CEG", "BE", "AAOI", "IREN", "CRWV", "NOK", "LITE"]

# Forms that carry financials / are most meaningful to an analyst.
KEY_FORMS = {"10-K", "10-Q", "20-F", "40-F", "8-K", "6-K"}


def ticker_to_cik() -> dict[str, int]:
    data = _fetch_json("https://www.sec.gov/files/company_tickers.json")
    out = {}
    for row in data.values():
        out[row["ticker"].upper()] = int(row["cik_str"])
    return out


def main() -> None:
    cikmap = ticker_to_cik()
    print(f"{'TICKER':<7} {'CIK':>10}  {'LATEST FILING':<13} {'FORM':<6} {'LATEST KEY FORM (10-K/Q,20-F,8-K...)'}")
    print("-" * 92)
    for t in TICKERS:
        cik = cikmap.get(t)
        if cik is None:
            print(f"{t:<7} {'?':>10}  not found in SEC ticker map")
            continue
        sub = get_submissions(cik, refresh=True)
        recent = sub["filings"]["recent"]
        dates = recent["filingDate"]
        forms = recent["form"]
        # index 0 is the most recent filing
        latest_date = dates[0] if dates else "-"
        latest_form = forms[0] if forms else "-"
        # most recent financial/material form
        key_date, key_form = "-", "-"
        for d, f in zip(dates, forms):
            if f in KEY_FORMS:
                key_date, key_form = d, f
                break
        name = sub.get("name", "")
        print(f"{t:<7} {cik:>10}  {latest_date:<13} {latest_form:<6} {key_date} {key_form:<6} | {name}")


if __name__ == "__main__":
    main()
