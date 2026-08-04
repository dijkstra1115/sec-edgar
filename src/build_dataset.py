"""
One-command build of the full standardized dataset.

Runs the two stages and then emits human-friendly WIDE pivots on top of the
long-format source of truth:

    data/standardized/
        facts_long.(json|csv)     raw curated XBRL facts        [stage 1: extract.py]
        metrics_long.(json|csv)   derived ratios & growth        [stage 2: derived.py]
        coverage.csv              field x company availability    [stage 1]
        wide_annual.csv           one row per company-fiscal year, every field a column
        wide_quarterly.csv        one row per company-quarter
        snapshot_latest.csv       latest fiscal year, core analyst line-up, $ in millions

Long format stays canonical (extensible, DB-friendly); the wide files are for eyeballing.
"""
from __future__ import annotations

import csv
import json
from pathlib import Path

import extract
import derived
import valuation

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "data" / "standardized"
DICT = json.loads((ROOT / "config" / "field_dictionary.json").read_text(encoding="utf-8"))

TICKER_ORDER = [c["ticker"] for c in json.loads((ROOT / "config" / "companies.json").read_text(encoding="utf-8"))["companies"]]


def _field_order():
    raw = [f["key"] for f in DICT["fields"] if not f.get("dimensional")]
    der = [m["key"] for m in DICT["derived_metrics"]]
    return raw + der


def _load_cube():
    facts = json.loads((OUT / "facts_long.json").read_text(encoding="utf-8"))
    mets = json.loads((OUT / "metrics_long.json").read_text(encoding="utf-8"))
    cube = {}
    for r in facts + mets:
        cube.setdefault((r["ticker"], r["fiscal_year"], r["fiscal_period"], r["period"]), {})[r["field_key"]] = r["value"]
    return cube


def _write_wide(cube, period_kind, path):
    cols = _field_order()
    keys = sorted(
        [k for k in cube if k[3] == period_kind],
        key=lambda k: (TICKER_ORDER.index(k[0]) if k[0] in TICKER_ORDER else 99, k[1], k[2]),
    )
    with open(path, "w", newline="", encoding="utf-8") as f:
        w = csv.writer(f)
        w.writerow(["ticker", "fiscal_year", "fiscal_period"] + cols)
        for (tk, fy, fp, _), vals in ((k, cube[k]) for k in keys):
            w.writerow([tk, fy, fp] + [vals.get(c, "") for c in cols])


def _write_snapshot(cube):
    """Latest-fiscal-year core scorecard, $ in millions / % for ratios — the 'what an
    analyst glances at first' view."""
    core_abs = ["revenue", "gross_profit", "operating_income", "net_income",
                "research_development_expense", "net_cash_from_operating_activities",
                "free_cash_flow", "cash_and_cash_equivalents", "total_debt"]
    core_pct = ["gross_margin", "operating_margin", "net_margin", "fcf_margin",
                "rd_intensity", "roe", "roic", "revenue_yoy_growth"]
    rows = []
    for tk in TICKER_ORDER:
        annuals = [k for k in cube if k[0] == tk and k[3] == "annual"]
        if not annuals:
            continue
        latest = max(annuals, key=lambda k: k[1])
        v = cube[latest]
        row = {"ticker": tk, "fiscal_year": latest[1]}
        for k in core_abs:
            row[k + "_$m"] = round(v[k] / 1e6) if v.get(k) is not None else ""
        for k in core_pct:
            row[k + "_%"] = round(v[k] * 100, 1) if v.get(k) is not None else ""
        rows.append(row)
    if not rows:
        return
    with open(OUT / "snapshot_latest.csv", "w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=list(rows[0].keys()))
        w.writeheader()
        w.writerows(rows)


def main():
    print("== stage 1: extract standardized facts ==")
    extract.main()
    print("\n== stage 2: compute derived metrics ==")
    derived.main()
    print("\n== stage 3: wide pivots & snapshot ==")
    cube = _load_cube()
    _write_wide(cube, "annual", OUT / "wide_annual.csv")
    _write_wide(cube, "quarterly", OUT / "wide_quarterly.csv")
    _write_snapshot(cube)
    print("wrote wide_annual.csv, wide_quarterly.csv, snapshot_latest.csv")

    print("\n== stage 4: valuation multiples + analyst consensus ==")
    print("(uses cached market data in data/raw/market/; run `python market_client.py` to refresh quotes)")
    try:
        valuation.main()
    except Exception as e:
        print(f"  skipped valuation (needs market data / network): {e!r}")


if __name__ == "__main__":
    main()
