"""
Thin, polite client for SEC EDGAR's free data APIs.

SEC rules we respect (https://www.sec.gov/os/accessing-edgar-data):
  - A descriptive User-Agent with contact info is REQUIRED.
  - No more than 10 requests/second. We self-throttle well under that.

We cache every raw API response to disk (data/raw/) so re-runs are instant and
we never re-hit SEC for data we already have. The standardization layer reads
ONLY from this raw cache, which keeps extraction reproducible and offline-friendly.
"""
from __future__ import annotations

import json
import time
import urllib.request
import urllib.error
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
RAW_DIR = ROOT / "data" / "raw"

# Identify ourselves to SEC. Edit the contact email if you fork this.
USER_AGENT = "sec-edgar-dataset research style78432@gmail.com"

_MIN_INTERVAL = 0.15  # seconds between requests (~6.6 req/s, comfortably under the 10/s cap)
_last_request_ts = [0.0]


def _throttle() -> None:
    now = time.monotonic()
    wait = _MIN_INTERVAL - (now - _last_request_ts[0])
    if wait > 0:
        time.sleep(wait)
    _last_request_ts[0] = time.monotonic()


def _fetch_json(url: str, retries: int = 4) -> dict:
    last_err = None
    for attempt in range(retries):
        _throttle()
        req = urllib.request.Request(url, headers={"User-Agent": USER_AGENT, "Accept-Encoding": "gzip, deflate"})
        try:
            with urllib.request.urlopen(req, timeout=30) as resp:
                raw = resp.read()
                if resp.headers.get("Content-Encoding") == "gzip":
                    import gzip
                    raw = gzip.decompress(raw)
                return json.loads(raw)
        except urllib.error.HTTPError as e:
            last_err = e
            if e.code == 404:
                raise  # genuinely missing; don't retry
            time.sleep(1.0 * (attempt + 1))  # back off on 429/5xx
        except urllib.error.URLError as e:
            last_err = e
            time.sleep(1.0 * (attempt + 1))
    raise RuntimeError(f"Failed to fetch {url} after {retries} attempts: {last_err}")


def _cached(cache_path: Path, url: str, refresh: bool = False) -> dict:
    if cache_path.exists() and not refresh:
        return json.loads(cache_path.read_text(encoding="utf-8"))
    data = _fetch_json(url)
    cache_path.parent.mkdir(parents=True, exist_ok=True)
    cache_path.write_text(json.dumps(data), encoding="utf-8")
    return data


def get_company_facts(cik: int, refresh: bool = False) -> dict:
    """All XBRL facts a company has ever reported, keyed by taxonomy/tag/unit."""
    url = f"https://data.sec.gov/api/xbrl/companyfacts/CIK{cik:010d}.json"
    return _cached(RAW_DIR / f"companyfacts_CIK{cik:010d}.json", url, refresh)


def get_submissions(cik: int, refresh: bool = False) -> dict:
    """Filing metadata (form types, dates, periods, accession numbers)."""
    url = f"https://data.sec.gov/submissions/CIK{cik:010d}.json"
    return _cached(RAW_DIR / f"submissions_CIK{cik:010d}.json", url, refresh)


if __name__ == "__main__":
    # smoke test
    facts = get_company_facts(1045810)
    gaap = facts["facts"].get("us-gaap", {})
    print(f"{facts['entityName']}: {len(gaap)} us-gaap concepts, "
          f"{len(facts['facts'].get('dei', {}))} dei concepts")
