"""
Build an institutional-ownership ("13F holders") dataset for our target universe by
REVERSE-indexing SEC's quarterly Form 13F bulk data sets.

Why bulk data: EDGAR has no "who holds ticker X" lookup — 13F is filed per manager.
SEC's quarterly data sets give the whole market's holdings as TSV tables, which we
filter by our stocks' CUSIPs and pivot into a per-stock list of institutional holders.

Pipeline:
  1. RESOLVE CUSIPs — one stream over the latest INFOTABLE, matching issuer NAME to
     each ticker, then picking the share class we want by aggregate value. Audited to
     stdout so a human can sanity-check the mapping before trusting it.
  2. AGGREGATE HOLDERS — stream the latest + prior quarter INFOTABLE, keep rows whose
     CUSIP is ours, are common stock (SH, not PRN) and not options (PUTCALL blank),
     sum shares/value per (cusip, manager), join manager names via COVERPAGE, restrict
     to original 13F-HR (drop amendments to avoid double counting), and compute QoQ
     change per holder (new / increased / decreased / exited).

Output: data/standardized/institutional_holders.csv  (+ _summary.csv)

Tables used inside each <window>_form13f.zip:
  INFOTABLE.tsv  ACCESSION_NUMBER, NAMEOFISSUER, TITLEOFCLASS, CUSIP, VALUE($), SSHPRNAMT, SSHPRNAMTTYPE, PUTCALL, ...
  COVERPAGE.tsv  ACCESSION_NUMBER, REPORTCALENDARORQUARTER, ISAMENDMENT, FILINGMANAGER_NAME, ...
  SUBMISSION.tsv ACCESSION_NUMBER, FILING_DATE, SUBMISSIONTYPE, CIK, PERIODOFREPORT
NOTE: VALUE is whole USD for 2023+ data sets (thousands before that). These windows are 2025/2026.
"""
from __future__ import annotations

import csv
import sys
import zipfile
from collections import defaultdict
from pathlib import Path

try:
    sys.stdout.reconfigure(encoding="utf-8")
except Exception:
    pass

ROOT = Path(__file__).resolve().parent.parent
RAW = ROOT / "data" / "raw" / "13f"
OUT = ROOT / "data" / "standardized"

LATEST_ZIP = RAW / "01mar2026-31may2026_form13f.zip"   # holdings as of 2026-03-31 (Q1'26)
PRIOR_ZIP = RAW / "01dec2025-28feb2026_form13f.zip"    # holdings as of 2025-12-31 (Q4'25)

# issuer-name patterns (uppercase substring match) + which share class to keep.
# class_hint: a substring that must appear in TITLEOFCLASS, or None = take the
# single CUSIP with the largest aggregate 13F value (the main common line).
TICKERS = [
    ("NVDA", ["NVIDIA"],                 None),
    ("MU",   ["MICRON TECH"],            None),
    ("SNDK", ["SANDISK"],                None),
    ("AVGO", ["BROADCOM"],               None),
    ("MRVL", ["MARVELL"],                None),
    ("GOOGL",["ALPHABET"],               "A"),    # Class A = GOOGL (Class C = GOOG)
    ("MSFT", ["MICROSOFT"],              None),
    ("META", ["META PLATFORMS"],         None),
    ("AMZN", ["AMAZON"],                 None),
    ("TSLA", ["TESLA"],                  None),
    ("CEG",  ["CONSTELLATION ENERGY"],   None),
    ("BE",   ["BLOOM ENERGY"],           None),
    ("AAOI", ["APPLIED OPTOELECTRON"],   None),
    ("IREN", ["IREN", "IRIS ENERGY"],    None),
    ("CRWV", ["COREWEAVE"],              None),
    ("NOK",  ["NOKIA"],                  None),
    ("LITE", ["LUMENTUM"],               None),
]

TOP_N = 25  # holders per stock to write out

# Manager-family rollup. Big institutions file 13F under MANY separate CIKs/entities
# (Vanguard split its umbrella CIK into ~10 sub-entities between 2025Q4 and 2026Q1),
# so neither name nor CIK is stable for QoQ. We roll sub-entities up to the parent by
# matching a substring; the FIRST match wins. Anything unmatched falls back to its
# first two name tokens, which collapses most remaining same-firm variants.
FAMILY_ALIASES = [
    ("VANGUARD", "Vanguard"), ("BLACKROCK", "BlackRock"),
    ("STATE STREET", "State Street"), ("GEODE", "Geode"),
    ("FMR", "Fidelity (FMR)"), ("FIDELITY", "Fidelity (FMR)"),
    ("MORGAN STANLEY", "Morgan Stanley"), ("GOLDMAN SACHS", "Goldman Sachs"),
    ("JPMORGAN", "JPMorgan"), ("JP MORGAN", "JPMorgan"), ("J P MORGAN", "JPMorgan"),
    ("MERRILL", "Bank of America"), ("BANK OF AMERICA", "Bank of America"), ("BOFA", "Bank of America"),
    ("WELLS FARGO", "Wells Fargo"), ("NORTHERN TRUST", "Northern Trust"),
    ("T ROWE", "T. Rowe Price"), ("ROWE PRICE", "T. Rowe Price"),
    ("INVESCO", "Invesco"), ("SCHWAB", "Charles Schwab"),
    ("DIMENSIONAL", "Dimensional"), ("MELLON", "BNY Mellon"), ("BANK OF NEW YORK", "BNY Mellon"),
    ("CITADEL", "Citadel"), ("CITIGROUP", "Citigroup"), ("CITIBANK", "Citigroup"),
    ("UBS ", "UBS"), ("DEUTSCHE", "Deutsche Bank"), ("BARCLAYS", "Barclays"),
    ("CREDIT SUISSE", "Credit Suisse"), ("AMERIPRISE", "Ameriprise"),
    ("CAPITAL RESEARCH", "Capital Group"), ("CAPITAL WORLD", "Capital Group"),
    ("CAPITAL INTERNATIONAL", "Capital Group"), ("CAPITAL GUARDIAN", "Capital Group"),
    ("JANE STREET", "Jane Street"), ("SUSQUEHANNA", "Susquehanna"),
    ("TWO SIGMA", "Two Sigma"), ("D. E. SHAW", "D.E. Shaw"), ("D.E. SHAW", "D.E. Shaw"),
    ("MILLENNIUM", "Millennium"), ("POINT72", "Point72"), ("RENAISSANCE TECH", "Renaissance"),
    ("NORGES", "Norges (Norway)"), ("ALLIANCEBERNSTEIN", "AllianceBernstein"),
    ("LEGAL & GENERAL", "Legal & General"), ("FRANKLIN RES", "Franklin"), ("FRANKLIN RESOURCES", "Franklin"),
]


def manager_family(name: str) -> str:
    u = name.upper()
    for needle, fam in FAMILY_ALIASES:
        if needle in u:
            return fam
    return " ".join(name.split()[:2])  # fallback: first two tokens


def _rows(zip_path: Path, member: str):
    """Yield dict rows from a TSV member, streaming (file is hundreds of MB)."""
    with zipfile.ZipFile(zip_path) as z, z.open(member) as f:
        header = f.readline().decode("utf-8", "replace").rstrip("\r\n").split("\t")
        idx = {h: i for i, h in enumerate(header)}
        for line in f:
            parts = line.decode("utf-8", "replace").rstrip("\r\n").split("\t")
            if len(parts) < len(header):
                continue
            yield idx, parts


def resolve_cusips(zip_path: Path):
    """Pass 1: map each ticker to its primary CUSIP via issuer-name matching."""
    # ticker -> (cusip, title) -> [value_sum, count]
    cand = {t: defaultdict(lambda: [0.0, 0]) for t, _, _ in TICKERS}
    pats = [(t, [p.upper() for p in pl], hint) for t, pl, hint in TICKERS]
    for idx, p in _rows(zip_path, "INFOTABLE.tsv"):
        name = p[idx["NAMEOFISSUER"]].upper()
        for t, plist, _hint in pats:
            if any(pat in name for pat in plist):
                cusip = p[idx["CUSIP"]].strip().upper()
                title = p[idx["TITLEOFCLASS"]].strip().upper()
                try:
                    val = float(p[idx["VALUE"]] or 0)
                except ValueError:
                    val = 0.0
                c = cand[t][(cusip, title)]
                c[0] += val
                c[1] += 1
                break

    resolved = {}
    print("== CUSIP resolution (audit) ==")
    for t, _pl, hint in TICKERS:
        entries = sorted(cand[t].items(), key=lambda kv: kv[1][0], reverse=True)
        if not entries:
            print(f"  {t:6} NO MATCH")
            continue
        chosen = None
        if hint:
            for (cusip, title), agg in entries:
                if hint in title.replace("CLASS", "CL").split():
                    chosen = (cusip, title, agg); break
        if chosen is None:
            (cusip, title), agg = entries[0]
            chosen = (cusip, title, agg)
        resolved[t] = chosen[0]
        flag = "" if len(entries) == 1 else f"  (+{len(entries)-1} other class/cusip)"
        print(f"  {t:6} {chosen[0]:<11} {chosen[1][:18]:<18} "
              f"${chosen[2][0]/1e9:>7.1f}B agg, {chosen[2][1]:>5} filers{flag}")
    return resolved


def aggregate_holders(zip_path: Path, cusip_to_ticker: dict):
    """Return {cusip: {family: [shares, value, set_of_ciks]}} for original 13F-HR filings.

    Positions are rolled up to the manager FAMILY (parent institution), because large
    firms file under many CIKs and reshuffle them across quarters (e.g. Vanguard split
    its umbrella CIK into ~10 sub-entities in 2026Q1). Family rollup is the only key
    that is stable enough for an honest QoQ comparison of a holder's position.
    """
    # accession -> CIK (SUBMISSION.tsv carries the manager CIK, for counting entities)
    accn_cik = {}
    for idx, p in _rows(zip_path, "SUBMISSION.tsv"):
        accn_cik[p[idx["ACCESSION_NUMBER"]]] = p[idx["CIK"]].strip()
    # accession -> (manager_name, is_amendment)
    cover = {}
    for idx, p in _rows(zip_path, "COVERPAGE.tsv"):
        accn = p[idx["ACCESSION_NUMBER"]]
        cover[accn] = (
            p[idx["FILINGMANAGER_NAME"]].strip(),
            p[idx["ISAMENDMENT"]].strip().upper() in ("Y", "TRUE", "1"),
        )
    holders = {c: defaultdict(lambda: [0.0, 0.0, set()]) for c in cusip_to_ticker}
    for idx, p in _rows(zip_path, "INFOTABLE.tsv"):
        cusip = p[idx["CUSIP"]].strip().upper()
        if cusip not in holders:
            continue
        if p[idx["PUTCALL"]].strip():        # skip option positions
            continue
        if p[idx["SSHPRNAMTTYPE"]].strip().upper() not in ("SH", ""):  # skip principal (debt)
            continue
        accn = p[idx["ACCESSION_NUMBER"]]
        meta = cover.get(accn)
        if not meta or meta[1]:              # missing cover or amendment -> skip
            continue
        try:
            shares = float(p[idx["SSHPRNAMT"]] or 0)
            value = float(p[idx["VALUE"]] or 0)
        except ValueError:
            continue
        fam = manager_family(meta[0])
        h = holders[cusip][fam]
        h[0] += shares
        h[1] += value
        h[2].add(accn_cik.get(accn, accn))
    return holders


def main():
    cusip_map = resolve_cusips(LATEST_ZIP)
    cusip_to_ticker = {c: t for t, c in cusip_map.items()}

    print("\n== aggregating holders: latest (Q1'26, period 2026-03-31) ==")
    cur = aggregate_holders(LATEST_ZIP, cusip_to_ticker)
    print("== aggregating holders: prior (Q4'25, period 2025-12-31) ==")
    prev = aggregate_holders(PRIOR_ZIP, cusip_to_ticker)

    OUT.mkdir(parents=True, exist_ok=True)
    rows, summary = [], []
    for t, cusip in cusip_map.items():
        cur_h = cur.get(cusip, {})
        prev_h = prev.get(cusip, {})
        tot_sh = sum(v[0] for v in cur_h.values())
        tot_val = sum(v[1] for v in cur_h.values())
        prev_tot_sh = sum(v[0] for v in prev_h.values())
        summary.append({
            "ticker": t, "cusip": cusip,
            "num_holders": len(cur_h),
            "total_shares": round(tot_sh),
            "total_value_usd": round(tot_val),
            "total_value_$m": round(tot_val / 1e6),
            "prev_num_holders": len(prev_h),
            "qoq_shares_chg": round(tot_sh - prev_tot_sh),
            "qoq_shares_chg_%": round((tot_sh - prev_tot_sh) / prev_tot_sh * 100, 1) if prev_tot_sh else "",
        })
        ranked = sorted(cur_h.items(), key=lambda kv: kv[1][1], reverse=True)
        for rank, (fam, (sh, val, ciks)) in enumerate(ranked[:TOP_N], 1):
            psh = prev_h.get(fam, [0.0, 0.0, set()])[0]   # match by stable manager family
            d = sh - psh
            if psh == 0:
                status = "NEW"
            elif d > 0:
                status = "increased"
            elif d < 0:
                status = "decreased"
            else:
                status = "unchanged"
            rows.append({
                "ticker": t, "cusip": cusip, "rank": rank, "manager": fam,
                "entities": len(ciks),
                "shares": round(sh), "value_usd": round(val), "value_$m": round(val / 1e6),
                "pct_of_13f_value": round(val / tot_val * 100, 2) if tot_val else "",
                "prev_shares": round(psh), "delta_shares": round(d),
                "delta_%": round(d / psh * 100, 1) if psh else "",
                "status": status,
            })

    with open(OUT / "institutional_holders.csv", "w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=list(rows[0].keys()))
        w.writeheader(); w.writerows(rows)
    with open(OUT / "institutional_holders_summary.csv", "w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=list(summary[0].keys()))
        w.writeheader(); w.writerows(summary)

    print(f"\nWrote {len(rows)} holder rows -> institutional_holders.csv")
    print("Wrote per-stock summary -> institutional_holders_summary.csv\n")
    print(f"{'TKR':6}{'#holders':>9}{'13F value $M':>14}{'QoQ shares %':>14}")
    for s in summary:
        print(f"{s['ticker']:6}{s['num_holders']:>9}{s['total_value_$m']:>14,}{str(s['qoq_shares_chg_%']):>14}")


if __name__ == "__main__":
    main()
