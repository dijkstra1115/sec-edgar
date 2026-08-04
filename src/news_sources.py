"""
Pluggable news fetchers for the news-alert layer. All REST, ZERO LLM / zero tokens.

Each fetcher returns a list of NORMALIZED items:
  {
    "source":   "benzinga" | "finnhub" | "sec_8k",
    "uid":      stable unique id (for dedup across polls),
    "tickers":  [watchlist tickers this item is about],
    "title":    str,
    "summary":  str,          # short teaser/summary, never the full body
    "url":      str,
    "published": int | None,  # unix seconds
  }

Source notes (discovered by probing the live free tiers, 2026-07-05):
  - benzinga: the free Basic tier serves the GENERAL news firehose with accurate
    `stocks` tags but does NOT support server-side ticker filtering (?tickers=
    returns []). So we pull the firehose and filter LOCALLY by stocks[].name.
  - finnhub: per-ticker company-news is high-volume and its `related` tag is loose
    (it relays Yahoo aggregation — e.g. an oil-stock article tagged NVDA). A cheap
    TEXT pre-gate (headline/summary must mention the ticker or company name) drops
    the obvious noise before anything reaches the LLM judge.
  - sec_8k: reuses the insider layer's throttled SEC fetch to catch new 8-K filings.
"""
from __future__ import annotations

import json
import re
import sys
import time
import urllib.error
import urllib.request
from datetime import datetime, timedelta, timezone
from email.utils import parsedate_to_datetime
from pathlib import Path

ROOT = Path(__file__).resolve().parent
sys.path.insert(0, str(ROOT))
from insider_alert import fetch_tracked_filings  # noqa: E402  (reuse throttled SEC fetch)

_UA = "sec-edgar-news-alert research style78432@gmail.com"

# Suffix noise to strip when deriving a company's core keyword from its legal name.
_NAME_STOP = re.compile(
    r"\b(inc|corp|corporation|co|ltd|plc|llc|holdings?|technology|technologies|"
    r"platforms?|group|company|the|sa|nv|ag|se)\b|[.,]|'s", re.IGNORECASE)


def _get_json(url: str, headers: dict | None = None, retries: int = 3):
    hdr = {"User-Agent": _UA}
    if headers:
        hdr.update(headers)
    last = None
    for attempt in range(retries):
        try:
            req = urllib.request.Request(url, headers=hdr)
            with urllib.request.urlopen(req, timeout=30) as resp:
                return json.loads(resp.read())
        except urllib.error.HTTPError as e:
            last = e
            if e.code in (401, 403, 404):
                raise
            time.sleep(1.0 * (attempt + 1))
        except Exception as e:  # noqa: BLE001
            last = e
            time.sleep(1.0 * (attempt + 1))
    raise RuntimeError(f"GET failed {url}: {last!r}")


def _core_keywords(name: str) -> list[str]:
    """Significant lowercase tokens of a company name, for text matching."""
    cleaned = _NAME_STOP.sub(" ", name or "")
    toks = [t for t in cleaned.lower().split() if len(t) >= 3]
    return toks[:2] or ([name.lower()] if name else [])


# --------------------------------------------------------------------------- #
# Benzinga — general firehose, filtered locally by stocks tag
# --------------------------------------------------------------------------- #
def fetch_benzinga(token: str, watch_tickers: set[str], page_size: int = 100,
                   display_output: str = "full") -> list[dict]:
    watch = {t.upper() for t in watch_tickers}
    url = (f"https://api.benzinga.com/api/v2/news?token={token}"
           f"&pageSize={page_size}&displayOutput={display_output}")
    data = _get_json(url, headers={"Accept": "application/json"})
    if not isinstance(data, list):
        return []
    out = []
    for s in data:
        tags = {(x.get("name") or "").upper() for x in (s.get("stocks") or [])}
        hit = sorted(watch & tags)
        if not hit:
            continue
        pub = None
        if s.get("created"):
            try:
                pub = int(parsedate_to_datetime(s["created"]).timestamp())
            except Exception:  # noqa: BLE001
                pub = None
        out.append({
            "source": "benzinga",
            "uid": f"bz:{s.get('id')}",
            "tickers": hit,
            "title": (s.get("title") or "").strip(),
            "summary": (s.get("teaser") or "").strip()[:500],
            "url": s.get("url", ""),
            "published": pub,
        })
    return out


# --------------------------------------------------------------------------- #
# Finnhub — per-ticker company-news with a text pre-gate
# --------------------------------------------------------------------------- #
def _mentions(text: str, ticker: str, keywords: list[str]) -> bool:
    low = text.lower()
    if re.search(rf"\b{re.escape(ticker.lower())}\b", low):
        return True
    return any(k in low for k in keywords)


def fetch_finnhub(token: str, companies: list[dict], lookback_days: int = 3) -> list[dict]:
    today = datetime.now(timezone.utc).date()
    frm = (today - timedelta(days=lookback_days)).isoformat()
    to = today.isoformat()
    out = []
    for c in companies:
        ticker = c["ticker"]
        kws = _core_keywords(c.get("name", ""))
        url = (f"https://finnhub.io/api/v1/company-news?symbol={ticker}"
               f"&from={frm}&to={to}&token={token}")
        try:
            data = _get_json(url)
        except Exception:  # noqa: BLE001
            continue
        if isinstance(data, list):
            for a in data:
                title = a.get("headline", "") or ""
                summary = a.get("summary", "") or ""
                if not _mentions(f"{title} {summary}", ticker, kws):
                    continue  # cheap pre-gate: drop loosely-tagged noise
                out.append({
                    "source": "finnhub",
                    "uid": f"fh:{a.get('id')}",
                    "tickers": [ticker],
                    "title": title.strip(),
                    "summary": summary.strip()[:500],
                    "url": a.get("url", ""),
                    "published": a.get("datetime"),
                })
        time.sleep(0.9)  # stay well under Finnhub free 60/min
    return out


# --------------------------------------------------------------------------- #
# SEC 8-K — reuse the insider layer's throttled submissions fetch
# --------------------------------------------------------------------------- #
def fetch_8k(companies: list[dict]) -> list[dict]:
    out = []
    for c in companies:
        cik = int(c["cik"])
        try:
            filings = fetch_tracked_filings(cik, {"8-K", "8-K/A"})
        except Exception:  # noqa: BLE001
            continue
        for f in filings:
            ts = None
            try:
                ts = int(datetime.fromisoformat(f["date"]).replace(
                    tzinfo=timezone.utc).timestamp())
            except Exception:  # noqa: BLE001
                ts = None
            out.append({
                "source": "sec_8k",
                "uid": f"8k:{f['accession']}",
                "tickers": [c["ticker"]],
                "title": f"{c['ticker']} filed {f['form']} (material event)",
                "summary": "SEC 8-K current report — official material event disclosure.",
                "url": f["view_url"],
                "published": ts,
            })
    return out


# --------------------------------------------------------------------------- #
# top-level: fetch all enabled sources
# --------------------------------------------------------------------------- #
def fetch_all(cfg: dict, secrets: dict, companies: list[dict]) -> list[dict]:
    src = cfg.get("sources", {})
    news = secrets.get("news", {})
    watch = {c["ticker"].upper() for c in companies}
    items: list[dict] = []

    if src.get("benzinga") and news.get("benzinga_token"):
        bz = cfg.get("benzinga", {})
        try:
            items += fetch_benzinga(news["benzinga_token"], watch,
                                    bz.get("page_size", 100),
                                    bz.get("display_output", "full"))
        except Exception as e:  # noqa: BLE001
            print(f"[news] benzinga fetch failed: {e!r}")

    if src.get("finnhub") and news.get("finnhub_token"):
        try:
            items += fetch_finnhub(news["finnhub_token"], companies,
                                   cfg.get("finnhub", {}).get("lookback_days", 3))
        except Exception as e:  # noqa: BLE001
            print(f"[news] finnhub fetch failed: {e!r}")

    if src.get("sec_8k"):
        try:
            items += fetch_8k(companies)
        except Exception as e:  # noqa: BLE001
            print(f"[news] 8-K fetch failed: {e!r}")

    return items
