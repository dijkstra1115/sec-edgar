"""
Fetch and summarize the latest 13F-HR (institutional holdings report) for a given
investment manager, identified by the MANAGER's CIK (not the stock's CIK).

13F mechanics that matter:
  - 13F is filed BY a manager (>$100M AUM), listing ALL their reportable holdings.
    There is NO native "who holds ticker X" reverse index in EDGAR — you either pull
    one manager at a time (this script) or aggregate the quarterly bulk data sets.
  - Holdings live in an XML "information table" (infotable). Columns we use:
    nameOfIssuer, cusip, value, shares (sshPrnamt), putCall.
  - VALUE UNITS CHANGED: filings before 2023-01 reported `value` in THOUSANDS of $;
    from 2023 onward it's in WHOLE dollars. We detect by the period and scale.
"""
from __future__ import annotations

import sys
import xml.etree.ElementTree as ET
from pathlib import Path

try:
    sys.stdout.reconfigure(encoding="utf-8")
except Exception:
    pass

sys.path.insert(0, str(Path(__file__).resolve().parent))
from sec_client import _fetch_json, USER_AGENT, _throttle  # noqa: E402
import urllib.request  # noqa: E402

# A few well-known managers to demo / reuse.
MANAGERS = {
    "BERKSHIRE": 1067983,   # Berkshire Hathaway
    "BLACKROCK": 1364742,   # BlackRock Inc.
    "VANGUARD": 102909,     # Vanguard Group
}


def _fetch_text(url: str) -> str:
    _throttle()
    req = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
    with urllib.request.urlopen(req, timeout=30) as resp:
        return resp.read().decode("utf-8", errors="replace")


def _latest_13f(cik: int):
    sub = _fetch_json(f"https://data.sec.gov/submissions/CIK{cik:010d}.json")
    r = sub["filings"]["recent"]
    name = sub.get("name", "")
    for i, form in enumerate(r["form"]):
        if form in ("13F-HR", "13F-HR/A"):
            accn_raw = r["accessionNumber"][i]
            accn = accn_raw.replace("-", "")
            date = r["filingDate"][i]
            period = r["reportDate"][i]
            base = f"https://www.sec.gov/Archives/edgar/data/{cik}/{accn}"
            return name, date, period, accn_raw, base
    return name, None, None, None, None


def _find_infotable_url(base: str, accn_raw: str) -> str | None:
    """The infotable XML name is often arbitrary (e.g. '53405.xml'), so we can't rely
    on the filename. List every .xml except the cover page (primary_doc.xml) and return
    the first whose contents actually contain <infoTable> elements."""
    idx = _fetch_json(f"{base}/index.json")
    candidates = [
        item["name"] for item in idx.get("directory", {}).get("item", [])
        if item["name"].lower().endswith(".xml") and "primary_doc" not in item["name"].lower()
    ]
    for name in candidates:
        url = f"{base}/{name}"
        try:
            if "infoTable" in _fetch_text(url):
                return url
        except Exception:
            continue
    return None


def _strip_ns(tag: str) -> str:
    return tag.rsplit("}", 1)[-1]


def parse_infotable(xml: str, value_in_thousands: bool):
    root = ET.fromstring(xml)
    rows = []
    for it in root.iter():
        if _strip_ns(it.tag) != "infoTable":
            continue
        d = {}
        for child in it.iter():
            d[_strip_ns(child.tag)] = (child.text or "").strip()
        val = float(d.get("value", "0") or 0)
        if value_in_thousands:
            val *= 1000
        rows.append({
            "issuer": d.get("nameOfIssuer", ""),
            "cusip": d.get("cusip", ""),
            "value": val,
            "shares": float(d.get("sshPrnamt", "0") or 0),
            "putCall": d.get("putCall", ""),
        })
    return rows


def summarize(key: str, cik: int, top: int = 15):
    name, date, period, accn, base = _latest_13f(cik)
    print("=" * 80)
    if not base:
        print(f"{key} (CIK {cik}): no 13F-HR found  [{name}]")
        return
    url = _find_infotable_url(base, accn)
    if not url:
        print(f"{key}: 13F found ({date}, period {period}) but no infotable XML located. {base}")
        return
    value_in_thousands = period < "2023-01-01"
    rows = parse_infotable(_fetch_text(url), value_in_thousands)
    total = sum(r["value"] for r in rows)
    print(f"{key}  [{name}]  申報日 {date}  持倉截止 {period}  (CIK {cik})")
    print(f"  總持倉市值 ${total/1e9:,.1f}B  跨 {len(rows)} 個部位")
    print(f"  前 {top} 大持股:")
    print(f"    {'ISSUER':<32} {'價值$M':>10} {'股數':>15} {'佔比%':>6}  {'PUT/CALL'}")
    for r in sorted(rows, key=lambda x: x["value"], reverse=True)[:top]:
        pc = r["putCall"] or ""
        print(f"    {r['issuer'][:32]:<32} {r['value']/1e6:>10,.0f} {r['shares']:>15,.0f} "
              f"{(r['value']/total*100 if total else 0):>6.1f}  {pc}")
    print(f"  來源: {url}")


def main():
    args = sys.argv[1:]
    if not args:
        summarize("BERKSHIRE", MANAGERS["BERKSHIRE"])
    else:
        for a in args:
            if a.upper() in MANAGERS:
                summarize(a.upper(), MANAGERS[a.upper()])
            else:
                summarize(f"CIK{a}", int(a))


if __name__ == "__main__":
    main()
