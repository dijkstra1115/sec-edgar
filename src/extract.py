"""
Standardize raw SEC XBRL companyfacts into a clean, analyst-curated dataset.

The hard problems this module solves (and why naive XBRL pulls are wrong):

1. TAG DRIFT: different companies tag the same concept differently
   (Revenues vs RevenueFromContractWithCustomerExcludingAssessedTax). The field
   dictionary lists tags in priority order; we use the first one a company actually has.

2. PERIOD AMBIGUITY: a Q3 10-Q reports the SAME duration tag for BOTH the
   3-month quarter AND the 9-month year-to-date span. Filtering by fiscal period
   alone double-counts. We classify duration points by day-span:
       ~90 days  -> quarterly (the standalone quarter)
       ~365 days -> annual (full fiscal year)
   and keep only the span that matches the period we want.

3. RESTATEMENT / COMPARATIVE DUPLICATES: the same (fiscal_year, period) value is
   re-reported as a prior-year comparative in later filings. We dedupe per
   (fy, fp) key, preferring the value from the filing that originally covered it.

Output is LONG format (one row per company/period/field) — the most extensible
shape for loading into a database or an app. A wide pivot is also written for humans.
"""
from __future__ import annotations

import json
from pathlib import Path

import sec_client as sc

ROOT = Path(__file__).resolve().parent.parent
DICT_PATH = ROOT / "config" / "field_dictionary.json"
OUT_DIR = ROOT / "data" / "standardized"

YEARS_BACK = 3  # keep the last N fiscal years of annual data (+ their quarters and any newer ones)

UNIT_MAP = {"USD": "USD", "shares": "shares", "USD/shares": "USD/shares"}


def _find_tag_node(facts: dict, tag: str):
    """Return (taxonomy, unit_dict) for the first taxonomy that has this tag."""
    for taxo in ("us-gaap", "dei"):
        node = facts["facts"].get(taxo, {}).get(tag)
        if node:
            return taxo, node.get("units", {})
    return None, None


def _pick_unit(units: dict, want_unit: str):
    """Choose the unit series matching the field's declared unit."""
    target = UNIT_MAP.get(want_unit, want_unit)
    if target in units:
        return target, units[target]
    # fall back to the only / first available unit
    if len(units) == 1:
        k = next(iter(units))
        return k, units[k]
    for k in units:
        if k.startswith("USD"):
            return k, units[k]
    k = next(iter(units))
    return k, units[k]


def _ymd(s):
    y, m, d = map(int, s.split("-"))
    return y, m, d


def _span_days(p):
    s, e = p.get("start"), p.get("end")
    if not s or not e:
        return None
    from datetime import date
    return (date(*_ymd(e)) - date(*_ymd(s))).days


def _fye_date(year, fye_m, fye_d):
    from datetime import date
    try:
        return date(year, fye_m, fye_d)
    except ValueError:  # e.g. Feb 29 in a non-leap year
        return date(year, fye_m, 28)


def _fiscal_label(end_date, fye_m, fye_d):
    """Map a period END date to (fiscal_year, quarter_number) robustly, even when a
    company's fiscal year-end DRIFTS across a month boundary year to year (52/53-week
    calendars: MRVL ends Jan 28 some years, Feb 3 others; AVGO Oct 29 vs Nov 3).

    Fiscal year = the first fiscal year-end on or after the period end (with ~3 weeks of
    tolerance so a period ending a few days *past* the nominal FYE still lands in that
    year). These 8 issuers all label a fiscal year by the calendar year it ends in.

    Quarter = days elapsed from the prior year-end / ~91.3, rounded. This is immune to
    the month drift that breaks a calendar-month formula (MRVL quarters end May/Aug/Nov).
    """
    from datetime import timedelta
    ed = __import__("datetime").date(*_ymd(end_date))
    fy = None
    for y in (ed.year, ed.year + 1):
        if ed <= _fye_date(y, fye_m, fye_d) + timedelta(days=21):
            fy = y
            break
    if fy is None:
        fy = ed.year + 1
    days_in = (ed - _fye_date(fy - 1, fye_m, fye_d)).days
    qn = max(1, min(4, round(days_in / (365 / 4))))
    return fy, qn


def _collect(points, period_type, fye_m, fye_d):
    """Return {(fiscal_year, fp): chosen_point}. fp in {FY, Q1, Q2, Q3}.

    Durations are split by day-span (annual ~365d -> FY; quarterly ~90d -> Q1-Q3,
    skipping the rare standalone Q4 3-month to avoid colliding with FY). Instants
    (balance sheet) snap to the period whose end they fall on; the year-end snapshot
    (quarter 4) is labeled FY so it aligns with the annual income statement.
    """
    out = {}
    for p in points:
        if p.get("form") not in ("10-K", "10-Q"):
            continue
        end = p.get("end")
        if not end:
            continue
        if period_type == "duration":
            d = _span_days(p)
            if d is None:
                continue
            if 300 <= d <= 400:
                fy, _ = _fiscal_label(end, fye_m, fye_d)
                fp = "FY"
            elif 80 <= d <= 100:
                fy, qn = _fiscal_label(end, fye_m, fye_d)
                if qn == 4:
                    continue  # standalone Q4 quarter; derive later, don't alias FY
                fp = f"Q{qn}"
            else:
                continue  # 6-mo / 9-mo year-to-date spans -> drop
        else:  # instant
            fy, qn = _fiscal_label(end, fye_m, fye_d)
            fp = "FY" if qn == 4 else f"Q{qn}"

        key = (fy, fp)
        if key not in out or _prefer(p, out[key], fp):
            out[key] = p
    return out


def _prefer(new, cur, fp) -> bool:
    """Among duplicate reports of the same period (original + later comparatives),
    prefer the as-originally-reported value: the matching form first (10-K for FY,
    10-Q for quarters), then the earliest filing (smallest accession)."""
    want = "10-K" if fp == "FY" else "10-Q"
    new_match = new.get("form") == want
    cur_match = cur.get("form") == want
    if new_match != cur_match:
        return new_match
    return new.get("accn", "") < cur.get("accn", "")


def extract_company(company: dict, field_dict: dict):
    facts = sc.get_company_facts(company["cik"])
    fye_m, fye_d = (int(x) for x in company["fiscal_year_end"].split("-"))
    rows = []
    coverage = {}  # field_key -> tag actually used (or None)

    for field in field_dict["fields"]:
        if field.get("dimensional"):
            coverage[field["key"]] = None  # needs dimensional (XBRL axis) extraction
            continue

        # Merge points across ALL candidate tags. Companies switch tags across years
        # (NVDA revenue: RevenueFromContract... -> Revenues in FY2023; AVGO net income:
        # NetIncomeLoss -> ProfitLoss in FY2025), so a single tag misses recent periods.
        # For each period, the highest-priority tag (earliest in the list) that has a
        # value wins.
        merged = {}  # (fy, fp) -> (point, tag, rank)
        used_tags = []
        for rank, tag in enumerate(field.get("us_gaap_tags", [])):
            _, u = _find_tag_node(facts, tag)
            if not u:
                continue
            unit_key, points = _pick_unit(u, field["unit"])
            collected = _collect(points, field["period_type"], fye_m, fye_d)
            if collected:
                used_tags.append(tag)
            for key, p in collected.items():
                if key not in merged or rank < merged[key][2]:
                    merged[key] = (p, tag, rank, unit_key)
        coverage[field["key"]] = used_tags[0] if used_tags else None
        if len(used_tags) > 1:
            coverage[field["key"]] = "+".join(used_tags)  # transparency: multiple tags spliced

        for (fy, fp), (p, tag, _rank, unit_key) in merged.items():
            kind = "annual" if fp == "FY" else "quarterly"
            rows.append(_row(company, fy, fp, field, p, tag, unit_key, kind))

    # window: keep last N fiscal years of annual + all quarters within/after
    annual_fys = sorted({r["fiscal_year"] for r in rows if r["period"] == "annual"})
    if annual_fys:
        min_fy = annual_fys[-1] - (YEARS_BACK - 1)
        rows = [r for r in rows if r["fiscal_year"] >= min_fy]
    return rows, coverage


def _row(company, fy, fp, field, p, tag, unit_key, period_kind):
    return {
        "ticker": company["ticker"],
        "cik": company["cik"],
        "fiscal_year": fy,
        "fiscal_period": fp,            # FY, Q1, Q2, Q3
        "period": period_kind,          # annual | quarterly
        "field_key": field["key"],
        "label": field["label"],
        "statement": field["statement"],
        "value": p["val"],
        "unit": unit_key,
        "period_start": p.get("start"),
        "period_end": p.get("end"),
        "form": p.get("form"),
        "accession": p.get("accn"),
        "xbrl_tag": tag,
    }


def main():
    field_dict = json.loads(DICT_PATH.read_text(encoding="utf-8"))
    companies = json.loads((ROOT / "config" / "companies.json").read_text(encoding="utf-8"))["companies"]
    OUT_DIR.mkdir(parents=True, exist_ok=True)

    all_rows = []
    coverage_report = {}
    for c in companies:
        # Foreign private issuers report under IFRS and carry zero us-gaap facts, so
        # every tag in the dictionary misses. Skip them loudly rather than emitting an
        # all-blank coverage row that looks like a pipeline bug.
        taxonomy = c.get("xbrl_taxonomy", "us-gaap")
        if taxonomy != "us-gaap":
            print(f"{c['ticker']:6}     - skipped: files under {taxonomy}, not us-gaap")
            continue
        rows, cov = extract_company(c, field_dict)
        all_rows.extend(rows)
        coverage_report[c["ticker"]] = cov
        n_periods = len({(r["fiscal_year"], r["fiscal_period"]) for r in rows})
        n_fields = len({r["field_key"] for r in rows})
        print(f"{c['ticker']:6} {len(rows):5} rows across {n_periods} periods, {n_fields} fields populated")

    (OUT_DIR / "facts_long.json").write_text(json.dumps(all_rows, indent=2), encoding="utf-8")
    _write_csv(all_rows)
    _write_coverage(coverage_report, field_dict)
    print(f"\nWrote {len(all_rows)} rows -> {OUT_DIR/'facts_long.json'} and facts_long.csv")


def _write_csv(rows):
    import csv
    if not rows:
        return
    cols = list(rows[0].keys())
    with open(OUT_DIR / "facts_long.csv", "w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=cols)
        w.writeheader()
        w.writerows(rows)


def _write_coverage(coverage_report, field_dict):
    """Which standardized fields resolved to a real tag for each company — the data-quality map."""
    keys = [f["key"] for f in field_dict["fields"] if not f.get("dimensional")]
    lines = ["field_key," + ",".join(coverage_report.keys())]
    for k in keys:
        cells = ["Y" if coverage_report[t].get(k) else "-" for t in coverage_report]
        lines.append(k + "," + ",".join(cells))
    (OUT_DIR / "coverage.csv").write_text("\n".join(lines), encoding="utf-8")


if __name__ == "__main__":
    main()
