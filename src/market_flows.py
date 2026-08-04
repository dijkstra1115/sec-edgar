"""
Market-wide institutional flow: which stocks did 13F filers, in aggregate, BUY and
SELL most last quarter? Reverse of build_13f.py — instead of fixing on our 17 tickers,
we aggregate EVERY security across all filers and rank the quarter-over-quarter change.

Metric design (and the traps each avoids):
  - NET $ FLOW = delta_shares * implied_price. Implied price = current value / current
    shares (the filing's own marks), so we don't need an external price feed and the
    figure is in real dollars. Ranking by raw share delta would over-weight cheap,
    high-share-count tickers; ranking by value delta would conflate price moves with
    actual buying. delta_shares * price isolates the buying/selling itself.
  - HOLDER BREADTH = change in number of distinct filers holding the name. Big money
    from one fund != broad accumulation; breadth tells them apart.
  - SPLIT / IPO FLAG: a forward split or fresh IPO makes share counts explode with no
    real "buying". We flag any name whose share count changed > +150% / < -60% so the
    reader treats its $ flow with suspicion (we have no split feed to auto-adjust).
  - Common stock only: drop option (PUTCALL) and debt (PRN) lines; drop amendments to
    avoid double-counting a manager's restated filing.

Output: data/standardized/market_flows.csv  (top net-bought + top net-sold)
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

from build_13f import _rows, LATEST_ZIP, PRIOR_ZIP  # reuse streaming reader + paths

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "data" / "standardized"

MIN_VALUE = 2e9   # ignore names held in < $2B aggregate (focus on what moves markets)
TOP_N = 30

# ETFs / pooled funds dominate raw 13F flow but aren't "stocks institutions are picking".
# Drop issuers whose name marks them as a fund so the clean ranking is operating companies.
FUND_MARKERS = ("ISHARES", "SPDR", "VANGUARD INDEX", "VANGUARD ", "PROSHARES", "INVESCO QQQ",
                "SELECT SECTOR", "ETF", "MONEY MARKET", " FDS", " FUND", " FUNDS", " TR ",
                "INDEX FD", "TRUST II", "POWERSHARES", "DIREXION", "WISDOMTREE", "GLOBAL X",
                "FIRST TR", "SCHWAB STRATEGIC", "DIMENSIONAL", "JPMORGAN ETF")


def is_fund(name: str) -> bool:
    u = " " + name.upper() + " "
    return any(m in u for m in FUND_MARKERS)


def aggregate_market(zip_path: Path):
    """Return {cusip: [shares, value, holders_set, issuer_name]} across all filers."""
    # accession -> is_amendment  (drop amendments)
    amend = {}
    for idx, p in _rows(zip_path, "COVERPAGE.tsv"):
        amend[p[idx["ACCESSION_NUMBER"]]] = p[idx["ISAMENDMENT"]].strip().upper() in ("Y", "TRUE", "1")
    agg = defaultdict(lambda: [0.0, 0.0, set(), ""])
    for idx, p in _rows(zip_path, "INFOTABLE.tsv"):
        if p[idx["PUTCALL"]].strip():
            continue
        if p[idx["SSHPRNAMTTYPE"]].strip().upper() not in ("SH", ""):
            continue
        accn = p[idx["ACCESSION_NUMBER"]]
        if amend.get(accn):
            continue
        cusip = p[idx["CUSIP"]].strip().upper()
        try:
            shares = float(p[idx["SSHPRNAMT"]] or 0)
            value = float(p[idx["VALUE"]] or 0)
        except ValueError:
            continue
        a = agg[cusip]
        a[0] += shares
        a[1] += value
        a[2].add(accn)
        if not a[3]:
            a[3] = p[idx["NAMEOFISSUER"]].strip()
    return agg


def main():
    print("== aggregating market: latest (Q1'26, period 2026-03-31) ==")
    cur = aggregate_market(LATEST_ZIP)
    print("== aggregating market: prior (Q4'25, period 2025-12-31) ==")
    prev = aggregate_market(PRIOR_ZIP)

    flows = []
    for cusip, (sh, val, holders, name) in cur.items():
        if val < MIN_VALUE:
            continue
        psh, pval, pholders, _ = prev.get(cusip, [0.0, 0.0, set(), ""])
        price = val / sh if sh else 0
        dsh = sh - psh
        net_flow = dsh * price
        pct = (dsh / psh * 100) if psh else None
        flag = ""
        if pct is None:
            flag = "NEW/IPO?"
        elif pct > 150 or pct < -60:
            flag = "split/IPO?"
        flows.append({
            "cusip": cusip, "issuer": name,
            "holders": len(holders), "holders_chg": len(holders) - len(pholders),
            "shares": round(sh), "value_$m": round(val / 1e6),
            "implied_price": round(price, 2),
            "delta_shares": round(dsh),
            "net_flow_$m": round(net_flow / 1e6),
            "shares_chg_%": round(pct, 1) if pct is not None else "",
            "flag": flag,
        })

    # "clean" universe: operating companies only (no funds), no corporate-action artifacts.
    clean = [r for r in flows if not r["flag"] and not is_fund(r["issuer"])]
    bought = sorted(clean, key=lambda r: r["net_flow_$m"], reverse=True)[:TOP_N]
    sold = sorted(clean, key=lambda r: r["net_flow_$m"])[:TOP_N]
    breadth = sorted(clean, key=lambda r: r["holders_chg"], reverse=True)[:TOP_N]

    OUT.mkdir(parents=True, exist_ok=True)
    with open(OUT / "market_flows.csv", "w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=["side"] + list(flows[0].keys()))
        w.writeheader()
        for r in bought:
            w.writerow({"side": "BOUGHT", **r})
        for r in sold:
            w.writerow({"side": "SOLD", **r})

    def show(title, rows):
        print(f"\n{title}")
        print(f"  {'ISSUER':<30}{'淨流入$M':>11}{'股數變動%':>10}{'持有家數±':>10}  flag")
        for r in rows:
            print(f"  {r['issuer'][:30]:<30}{r['net_flow_$m']:>11,}{str(r['shares_chg_%']):>10}"
                  f"{r['holders_chg']:>10}  {r['flag']}")

    show(f"== 機構 Q1'26 淨買超 TOP 15・個股 (排除ETF/併購, 門檻>${MIN_VALUE/1e9:.0f}B) ==", bought[:15])
    show("== 機構 Q1'26 淨賣超 TOP 15・個股 ==", sold[:15])
    show("== 持有機構家數增加最多 TOP 15 (廣度·個股) ==", breadth[:15])
    print(f"\nWrote market_flows.csv ({len(bought)} bought + {len(sold)} sold)")


if __name__ == "__main__":
    main()
