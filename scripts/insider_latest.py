"""Fetch each target company's most recent Form 4 OPEN-MARKET SALE (code S) and
extract: transaction date, cash-out amount, avg price, % of holding sold, 10b5-1 flag.

Read-only: hits SEC submissions API + the Form 4 XML for each filing. No local writes.
"""
import json, time, sys
import xml.etree.ElementTree as ET
import requests

UA = {"User-Agent": "style78432@gmail.com"}
COMPANIES = json.load(open("config/companies.json"))["companies"]

# how many recent Form 4s to scan per company looking for a sale
SCAN = 12

def get(url):
    r = requests.get(url, headers=UA, timeout=30)
    r.raise_for_status()
    return r

def recent_form4s(cik):
    j = get(f"https://data.sec.gov/submissions/CIK{cik:010d}.json").json()
    rec = j["filings"]["recent"]
    out = []
    for acc, form, date, doc in zip(rec["accessionNumber"], rec["form"],
                                    rec["filingDate"], rec["primaryDocument"]):
        if form == "4":
            out.append((acc, date, doc))
    return out  # already newest-first

def txt(node):
    return node.text.strip() if node is not None and node.text else ""

def parse_form4(cik, acc, doc):
    accnodash = acc.replace("-", "")
    doc = doc.split("/")[-1]  # strip xslF345X0n/ prefix -> raw Form 4 XML
    url = f"https://www.sec.gov/Archives/edgar/data/{cik}/{accnodash}/{doc}"
    root = ET.fromstring(get(url).content)
    owner = root.find(".//reportingOwner/reportingOwnerId/rptOwnerName")
    rel = root.find(".//reportingOwnerRelationship")
    def relf(tag):
        return txt(rel.find(tag)) if rel is not None else ""
    is_dir = relf("isDirector") in ("1", "true")
    is_off = relf("isOfficer") in ("1", "true")
    title = relf("officerTitle")
    aff = root.find("aff10b5One")
    is_10b5 = txt(aff) in ("1", "true")
    role = []
    if is_dir: role.append("Director")
    if is_off: role.append(title or "Officer")
    if relf("isTenPercentOwner") in ("1", "true"): role.append("10%Owner")
    sales = []
    for t in root.findall(".//nonDerivativeTransaction"):
        code = txt(t.find(".//transactionCoding/transactionCode"))
        ad = txt(t.find(".//transactionAcquiredDisposedCode/value"))
        shares = txt(t.find(".//transactionShares/value"))
        price = txt(t.find(".//transactionPricePerShare/value"))
        after = txt(t.find(".//sharesOwnedFollowingTransaction/value"))
        date = txt(t.find(".//transactionDate/value"))
        sales.append({"code": code, "ad": ad, "shares": shares,
                      "price": price, "after": after, "date": date})
    return {"owner": txt(owner), "role": "/".join(role) or "?",
            "is_10b5": is_10b5, "txns": sales, "url":
            f"https://www.sec.gov/Archives/edgar/data/{cik}/{accnodash}/{doc}"}

def aggregate_sale(parsed, filing_date):
    """Aggregate all open-market sale (code S, disposed) rows in one filing into a
    single weighted figure. Returns None if the filing has no sale."""
    rows = [t for t in parsed["txns"] if t["code"] == "S" and t["ad"] == "D" and t["price"]]
    if not rows:
        return None
    tot_sh = sum(float(t["shares"] or 0) for t in rows)
    tot_val = sum(float(t["shares"] or 0) * float(t["price"] or 0) for t in rows)
    # shares still held after the LAST sale row in the filing (lowest remaining)
    afters = [float(t["after"]) for t in rows if t["after"]]
    after = min(afters) if afters else 0
    txn_date = max(t["date"] for t in rows if t["date"]) or filing_date
    avg = tot_val / tot_sh if tot_sh else 0
    pct = (tot_sh / (tot_sh + after) * 100) if (tot_sh + after) > 0 else None
    return {"filing_date": filing_date, "txn_date": txn_date, "owner": parsed["owner"],
            "role": parsed["role"], "shares": tot_sh, "price": avg, "value": tot_val,
            "after": after, "pct": pct, "is_10b5": parsed["is_10b5"], "url": parsed["url"]}

results = []
for c in COMPANIES:
    cik = c["cik"]
    rec = {"ticker": c["ticker"], "name": c["name"], "found": None}
    try:
        f4s = recent_form4s(cik)
    except Exception as e:
        rec["error"] = f"submissions: {e}"
        results.append(rec); continue
    if not f4s:
        rec["error"] = "no Form 4 filings"
        results.append(rec); continue
    rec["total_f4"] = len(f4s)
    rec["latest_f4_date"] = f4s[0][1]
    # scan recent filings, aggregate each filing's sale, keep the one with the
    # latest TRANSACTION date (tie-break: largest cash value)
    sales = []
    for acc, date, doc in f4s[:SCAN]:
        try:
            p = parse_form4(cik, acc, doc)
        except Exception:
            continue
        s = aggregate_sale(p, date)
        if s:
            sales.append(s)
        time.sleep(0.1)
    if sales:
        sales.sort(key=lambda s: (s["txn_date"], s["value"]), reverse=True)
        rec["found"] = sales[0]
        rec["other_recent"] = [
            {k: s[k] for k in ("txn_date", "owner", "shares", "value", "is_10b5")}
            for s in sales[:6]
        ]
    results.append(rec)
    time.sleep(0.1)

print(json.dumps(results, ensure_ascii=False, indent=2))
