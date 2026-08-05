"""Hand the content workflow everything the rest of this repo already knows about a ticker.

The detection layer (news + insider alerts) and the foundation layer (XBRL dataset,
13F flows, valuation multiples) both accumulate material that never reaches the
Threads drafting process. This is the bridge: one command, one readable block.

    python scripts/post_context.py NVDA        # context for one name
    python scripts/post_context.py --scout     # what is worth writing about next
    python scripts/post_context.py NVDA --json # machine-readable

Read-only. Stdlib only. Every section degrades to a stated reason when its source
file is missing, so a fresh clone still runs.
"""
from __future__ import annotations

import argparse
import csv
import json
import re
import sys
from collections import defaultdict
from datetime import datetime, timedelta, timezone
from pathlib import Path

# Headlines carry smart quotes and dashes; the Windows console defaults to a legacy
# codepage and mangles them. Force UTF-8 out so the block is safe to quote from.
for _stream in (sys.stdout, sys.stderr):
    try:
        _stream.reconfigure(encoding="utf-8", errors="replace")
    except (AttributeError, ValueError):
        pass

ROOT = Path(__file__).resolve().parents[1]
COMPANIES = ROOT / "config" / "companies.json"
ALERT_LOG = ROOT / "data" / "alerts" / "alerts.log"
NEWS_LOG = ROOT / "data" / "news" / "news.log"
FLOWS = ROOT / "data" / "standardized" / "market_flows.csv"
VALUATION = ROOT / "data" / "standardized" / "valuation_latest.csv"

STALE_AFTER_DAYS = 45

# Corporate-form noise that stops issuer names in 13F data from matching our own.
_SUFFIXES = {
    "CORP", "CORPORATION", "INC", "INCORPORATED", "LTD", "LIMITED", "PLC", "CO",
    "COMPANY", "HOLDINGS", "HOLDING", "GROUP", "THE", "COM", "SA", "NV", "AG",
    "CLASS", "A", "B", "C", "DEL", "NEW",
}


def _norm(name: str) -> list[str]:
    """Normalise a company name to its significant tokens."""
    words = re.sub(r"[^A-Za-z0-9 ]", " ", name.upper()).split()
    return [w for w in words if w not in _SUFFIXES] or words


def _same_issuer(a: str, b: str) -> bool:
    ta, tb = _norm(a), _norm(b)
    if not ta or not tb:
        return False
    if ta[0] != tb[0]:
        return False
    # One-word names (META, INTEL) match on the first token alone; longer names
    # need a second token so "APPLIED OPTOELECTRONICS" cannot swallow "APPLIED
    # MATERIALS".
    if len(ta) == 1 or len(tb) == 1:
        return True
    return ta[1] == tb[1]


def load_companies() -> list[dict]:
    if not COMPANIES.exists():
        return []
    return json.loads(COMPANIES.read_text(encoding="utf-8"))["companies"]


def find_company(ticker: str, companies: list[dict]) -> dict | None:
    return next((c for c in companies if c["ticker"].upper() == ticker.upper()), None)


# --------------------------------------------------------------------------- alerts

_TS = re.compile(r"^(\d{4}-\d{2}-\d{2})[ T](\d{2}:\d{2}:\d{2})")


def _parse_pushes(path: Path, kind: str) -> list[dict]:
    """Pull [push:ok] lines out of an alert log into {date, tickers, detail, score}."""
    if not path.exists():
        return []
    out = []
    for line in path.read_text(encoding="utf-8", errors="replace").splitlines():
        if "[push:ok]" not in line:
            continue
        m = _TS.match(line)
        if not m:
            continue
        rest = line.split("[push:ok]", 1)[1].strip()
        parts = rest.split(None, 1)
        if not parts:
            continue
        tickers = [t.strip().upper() for t in parts[0].split(",") if t.strip()]
        detail = parts[1] if len(parts) > 1 else ""
        score = None
        sm = re.search(r"\bm=(\d+)", detail)
        if sm:
            score = int(sm.group(1))
            detail = detail[sm.end():].strip()
        detail = re.sub(r"^\(\d+x\)\s*", "", detail)
        out.append({"date": m.group(1), "kind": kind, "tickers": tickers,
                    "score": score, "detail": detail.strip()})
    return out


def all_pushes(days: int) -> list[dict]:
    cutoff = (datetime.now(timezone.utc) - timedelta(days=days)).strftime("%Y-%m-%d")
    rows = _parse_pushes(NEWS_LOG, "news") + _parse_pushes(ALERT_LOG, "insider")
    return sorted((r for r in rows if r["date"] >= cutoff),
                  key=lambda r: r["date"], reverse=True)


# ---------------------------------------------------------------------- 13F flows

def institutional_flow(company: dict | None, ticker: str) -> dict:
    if not FLOWS.exists():
        return {"status": "missing", "note": f"{FLOWS.relative_to(ROOT)} not built yet"}
    name = company["name"] if company else ticker
    rows = list(csv.DictReader(FLOWS.open(encoding="utf-8")))
    hits = [r for r in rows if _same_issuer(r.get("issuer", ""), name)]
    if not hits:
        return {"status": "absent",
                "note": "not in this quarter's largest-flow table, which only ranks the top movers"}
    total = 0.0
    for r in hits:
        try:
            total += float(r.get("net_flow_$m") or 0)
        except ValueError:
            pass
    return {
        "status": "found",
        "net_flow_musd": total,
        "rows": [{"issuer": r["issuer"], "side": r["side"],
                  "net_flow_musd": r.get("net_flow_$m"),
                  "holders_chg": r.get("holders_chg"),
                  "shares_chg_pct": r.get("shares_chg_%")} for r in hits],
    }


# ----------------------------------------------------------------------- valuation

_VAL_FIELDS = [
    ("price", "price"), ("market_cap", "market cap"), ("pe_ttm", "trailing PE"),
    ("fwd_pe_consensus", "forward PE (consensus)"), ("yf_forward_pe", "forward PE (yahoo)"),
    ("ps_ttm", "P/S"), ("pb", "P/B"), ("ev_ebitda", "EV/EBITDA"),
    ("fcf_yield_pct", "FCF yield %"), ("ttm_fcf", "TTM FCF"), ("ttm_net_income", "TTM net income"),
    ("target_upside_pct", "analyst target upside %"), ("recommendation", "consensus rec"),
]


def curated_valuation(ticker: str) -> dict:
    if not VALUATION.exists():
        return {"status": "missing", "note": f"{VALUATION.relative_to(ROOT)} not built yet"}
    for r in csv.DictReader(VALUATION.open(encoding="utf-8")):
        if r["ticker"].upper() == ticker.upper():
            as_of = r.get("as_of", "")
            age = None
            try:
                age = (datetime.now(timezone.utc)
                       - datetime.fromisoformat(as_of.replace("Z", "+00:00"))).days
            except ValueError:
                pass
            return {"status": "found", "as_of": as_of, "age_days": age,
                    "fields": {label: r.get(key) for key, label in _VAL_FIELDS if r.get(key)}}
    return {"status": "absent", "note": "ticker not in the curated dataset; add it to config/companies.json"}


# ------------------------------------------------------------------------- output

def build_context(ticker: str, days: int) -> dict:
    companies = load_companies()
    company = find_company(ticker, companies)
    pushes = [p for p in all_pushes(days) if ticker.upper() in p["tickers"]]
    return {
        "ticker": ticker.upper(),
        "on_watchlist": company is not None,
        "company": company,
        "window_days": days,
        "alerts": pushes,
        "institutional_flow": institutional_flow(company, ticker),
        "valuation": curated_valuation(ticker),
    }


def _fmt_musd(v: float) -> str:
    return f"{'+' if v >= 0 else ''}{v:,.0f}M USD"


def render(ctx: dict) -> str:
    t = ctx["ticker"]
    L = [f"# post-context: {t}", ""]

    c = ctx["company"]
    if c:
        L.append(f"Watchlist: yes ({c['name']}, CIK {c['cik']}, FY ends {c['fiscal_year_end']})")
        if c.get("xbrl_taxonomy", "us-gaap") != "us-gaap":
            L.append(f"  ! Files under {c['xbrl_taxonomy']}, so this repo holds NO XBRL financials "
                     f"for it. Take financials from the transcript.")
        if c.get("history_note"):
            L.append(f"  note: {c['history_note']}")
    else:
        L.append("Watchlist: NO. Not in config/companies.json, so no alerts, flows or "
                 "curated financials exist for it here.")
    L.append("")

    L.append(f"## Alert activity (last {ctx['window_days']}d) - what your own system already flagged")
    if not ctx["alerts"]:
        L.append("  (nothing pushed in this window)")
    for a in ctx["alerts"][:12]:
        score = f" m={a['score']}" if a["score"] is not None else ""
        L.append(f"  {a['date']}  [{a['kind']}]{score}  {a['detail'][:110]}")
    L.append("")

    f = ctx["institutional_flow"]
    L.append("## Institutional flow (13F, most recent quarter processed)")
    if f["status"] == "found":
        L.append(f"  net {_fmt_musd(f['net_flow_musd'])} across {len(f['rows'])} line(s)")
        for r in f["rows"]:
            L.append(f"    {r['issuer']}: {r['side']} {r['net_flow_musd']}M, "
                     f"holders {r['holders_chg']}, shares {r['shares_chg_pct']}%")
    else:
        L.append(f"  {f.get('note')}")
    L.append("")

    v = ctx["valuation"]
    L.append("## Curated valuation (this repo's own dataset)")
    if v["status"] == "found":
        age = v.get("age_days")
        stale = age is not None and age > STALE_AFTER_DAYS
        L.append(f"  as of {v['as_of'][:10]}" + (f"  ! {age}d old, REBUILD BEFORE QUOTING" if stale else ""))
        for label, val in v["fields"].items():
            L.append(f"    {label}: {val}")
    else:
        L.append(f"  {v.get('note')}")
    return "\n".join(L)


def scout(days: int, limit: int) -> str:
    companies = load_companies()
    known = {c["ticker"].upper() for c in companies}
    agg: dict[str, dict] = defaultdict(lambda: {"news": 0, "insider": 0, "best": 0, "latest": "", "headline": ""})
    for p in all_pushes(days):
        for t in p["tickers"]:
            if t not in known:
                continue
            a = agg[t]
            a[p["kind"]] += 1
            if p["score"] and p["score"] > a["best"]:
                a["best"] = p["score"]
            if p["date"] > a["latest"]:
                a["latest"] = p["date"]
                a["headline"] = p["detail"][:80]

    ranked = sorted(agg.items(),
                    key=lambda kv: (kv[1]["insider"] * 2 + kv[1]["news"], kv[1]["best"]),
                    reverse=True)[:limit]
    L = [f"# scout: watchlist names with alert activity in the last {days}d", ""]
    if not ranked:
        L.append("  (no pushes in this window - check the schedulers are running)")
    for t, a in ranked:
        L.append(f"  {t:6} news={a['news']:<3} insider={a['insider']:<3} peak_materiality={a['best'] or '-':<4} "
                 f"last={a['latest']}")
        if a["headline"]:
            L.append(f"         {a['headline']}")
    L.append("")
    L.append("Cross this against upcoming earnings dates (FMP calendar) and write about the")
    L.append("overlap: a name your own system keeps flagging AND that reports within ~10 days.")
    return "\n".join(L)


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__,
                                 formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("ticker", nargs="?", help="ticker to build context for")
    ap.add_argument("--scout", action="store_true", help="rank candidates instead")
    ap.add_argument("--days", type=int, default=30, help="lookback window (default 30)")
    ap.add_argument("--limit", type=int, default=12, help="scout: how many names")
    ap.add_argument("--json", action="store_true", dest="as_json")
    args = ap.parse_args()

    if args.scout or not args.ticker:
        if args.as_json:
            print(json.dumps(all_pushes(args.days), indent=2, ensure_ascii=False))
        else:
            print(scout(args.days, args.limit))
        return 0

    ctx = build_context(args.ticker, args.days)
    print(json.dumps(ctx, indent=2, ensure_ascii=False) if args.as_json else render(ctx))
    return 0


if __name__ == "__main__":
    sys.exit(main())
