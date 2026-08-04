"""
One-off: fetch and summarize the most recent Form 4 (insider transaction) for a
set of tickers. Reports, per filing, the reporting insider, what they did
(buy/sell/grant/exercise), shares, weighted-average price, total $ value, and
whether the trades were made under a Rule 10b5-1 trading plan.

Form 4 is an XML document (ownershipDocument). Non-derivative table holds open-market
stock transactions; transaction codes: S=sale, P=open-market buy, A=grant/award,
M=option exercise, F=tax withholding, G=gift, C=conversion.
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

CIKS = {"META": 1326801, "AMZN": 1018724, "NVDA": 1045810, "MU": 723125,
        "SNDK": 2023554, "BE": 1664703, "CRWV": 1769628, "LITE": 1633978}

CODE_MEANING = {"S": "賣出 (open-market sale)", "P": "買進 (open-market buy)",
                "A": "獲授予 (grant/award)", "M": "選擇權行使 (option exercise)",
                "F": "扣稅交股 (tax withholding)", "G": "贈與 (gift)",
                "C": "轉換 (conversion)", "D": "處分 (disposition)"}


def _fetch_text(url: str) -> str:
    _throttle()
    req = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
    with urllib.request.urlopen(req, timeout=30) as resp:
        return resp.read().decode("utf-8", errors="replace")


def _latest_form4_url(cik: int):
    sub = _fetch_json(f"https://data.sec.gov/submissions/CIK{cik:010d}.json")
    r = sub["filings"]["recent"]
    for i, form in enumerate(r["form"]):
        if form == "4":
            accn = r["accessionNumber"][i].replace("-", "")
            doc = r["primaryDocument"][i]
            # primaryDocument points at the XSL-rendered HTML (xslF345X06/<name>);
            # the raw parseable XML is the same name without that folder prefix.
            if "/" in doc:
                doc = doc.rsplit("/", 1)[-1]
            date = r["filingDate"][i]
            return f"https://www.sec.gov/Archives/edgar/data/{cik}/{accn}/{doc}", date
    return None, None


def _txt(node, path):
    el = node.find(path)
    return el.text.strip() if el is not None and el.text else None


def parse_form4(xml: str) -> dict:
    root = ET.fromstring(xml)
    owner = root.find(".//reportingOwner/reportingOwnerId/rptOwnerName")
    owner_name = owner.text.strip() if owner is not None and owner.text else "?"
    rel = root.find(".//reportingOwner/reportingOwnerRelationship")
    titles = []
    if rel is not None:
        if _txt(rel, "isDirector") in ("1", "true"):
            titles.append("Director")
        if _txt(rel, "isOfficer") in ("1", "true"):
            titles.append(_txt(rel, "officerTitle") or "Officer")
        if _txt(rel, "isTenPercentOwner") in ("1", "true"):
            titles.append("10% owner")

    # collect footnote text (10b5-1 disclosures usually live here)
    footnotes = {}
    for fn in root.findall(".//footnotes/footnote"):
        footnotes[fn.get("id")] = (fn.text or "").strip()
    all_footnote_text = " ".join(footnotes.values()).lower()

    txns = []
    for t in root.findall(".//nonDerivativeTable/nonDerivativeTransaction"):
        code = _txt(t, "transactionCoding/transactionCode")
        shares = _txt(t, "transactionAmounts/transactionShares/value")
        price = _txt(t, "transactionAmounts/transactionPricePerShare/value")
        acq_disp = _txt(t, "transactionAmounts/transactionAcquiredDisposedCode/value")
        date = _txt(t, "transactionDate/value")
        # per-transaction 10b5-1 flag (structured field on newer forms)
        flag = _txt(t, "transactionCoding/transactionTimeliness")  # not the flag; placeholder
        txns.append({
            "date": date, "code": code, "acq_disp": acq_disp,
            "shares": float(shares) if shares else 0.0,
            "price": float(price) if price else 0.0,
        })

    # structured 10b5-1 flag (Form 4 schema: <aff10b5One> or footnote reference)
    aff = root.find(".//aff10b5One")
    rule_flag = None
    if aff is not None and aff.text:
        rule_flag = aff.text.strip() in ("1", "true")
    has_10b51 = bool(rule_flag) or ("10b5-1" in all_footnote_text)

    return {"owner": owner_name, "titles": titles, "txns": txns,
            "has_10b51": has_10b51, "footnotes": footnotes}


def main():
    for t, cik in CIKS.items():
        url, fdate = _latest_form4_url(cik)
        print("=" * 78)
        if not url:
            print(f"{t}: no Form 4 found")
            continue
        try:
            data = parse_form4(_fetch_text(url))
        except Exception as e:
            print(f"{t}: failed to parse ({e!r})  {url}")
            continue
        title = ", ".join(data["titles"]) or "—"
        print(f"{t}  申報日 {fdate}  內部人: {data['owner']} ({title})")
        print(f"     10b5-1 計畫: {'是 ✓' if data['has_10b51'] else '否/未註明'}")
        # aggregate sales (S) and buys (P) separately
        for label, codes in (("賣出 S", {"S"}), ("買進 P", {"P"})):
            rel = [x for x in data["txns"] if x["code"] in codes and x["shares"]]
            if not rel:
                continue
            sh = sum(x["shares"] for x in rel)
            val = sum(x["shares"] * x["price"] for x in rel)
            avg = val / sh if sh else 0
            print(f"     {label}: {sh:,.0f} 股  均價 ${avg:,.2f}  總額 ${val:,.0f}")
        # show any other coded transactions (grants, exercises, tax)
        other = [x for x in data["txns"] if x["code"] not in {"S", "P"} and x["shares"]]
        for x in other:
            mean = CODE_MEANING.get(x["code"], x["code"])
            note = f" @ ${x['price']:,.2f}" if x["price"] else ""
            print(f"     其他: {x['shares']:,.0f} 股 {mean} ({x['acq_disp']}){note}")
        print(f"     來源: {url}")


if __name__ == "__main__":
    main()
