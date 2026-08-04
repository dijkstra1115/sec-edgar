"""
SEC EDGAR insider-filing alerter  —  rule-based, ZERO tokens at runtime.

What it does, once every scheduled run:
  1. For each company on the watchlist (config/companies.json), fetch its SEC
     submissions feed FRESH (bypassing the dataset cache).
  2. Diff against a small state file to find NEW Form 4 / 4-A filings.
  3. Parse each new Form 4 (deterministic XML parse — no LLM) and CLASSIFY it:
        HIGH   open-market BUY (code P)  |  abnormally large SELL
        MEDIUM ordinary open-market sale
        LOW    grants / option exercises / tax withholding / gifts (routine)
  4. Push only the tiers in config -> Telegram (or any pluggable notifier).

Nothing here calls Claude / any LLM: HTTP GET + XML parse + one HTTP POST.
First run SEEDS state silently (records existing filings, sends nothing) so you
are not flooded with historical filings.

Usage:
  python src/insider_alert.py                 # one poll cycle (what Task Scheduler runs)
  python src/insider_alert.py --dry-run       # classify recent 30d & PRINT, no send, no state change
  python src/insider_alert.py --dry-run --days 90
  python src/insider_alert.py --seed          # (re)seed state silently and exit
  python src/insider_alert.py --test          # send a test message via the notifier
  python src/insider_alert.py --get-chat-id   # (telegram) discover your chat_id
  python src/insider_alert.py --force         # ignore the ET filing-hours window
"""
from __future__ import annotations

import argparse
import html
import json
import sys
import xml.etree.ElementTree as ET
from datetime import datetime, timedelta, timezone
from pathlib import Path

try:
    sys.stdout.reconfigure(encoding="utf-8")
except Exception:
    pass

ROOT = Path(__file__).resolve().parent
sys.path.insert(0, str(ROOT))
from sec_client import _fetch_json  # noqa: E402  (throttled + polite SEC client)
from read_form4 import _fetch_text  # noqa: E402  (throttled raw-document fetch)
from notifier import ConsoleNotifier, TelegramNotifier, build_notifier  # noqa: E402

REPO = ROOT.parent
CONFIG_FILE = REPO / "config" / "alert_config.json"
STATE_FILE = REPO / "data" / "alerts" / "state.json"
LOG_FILE = REPO / "data" / "alerts" / "alerts.log"

_TIER_EMOJI = {"HIGH": "\U0001F534", "MEDIUM": "\U0001F7E1", "LOW": "⚪"}


# --------------------------------------------------------------------------- #
# config / watchlist
# --------------------------------------------------------------------------- #
def load_config() -> dict:
    cfg = json.loads(CONFIG_FILE.read_text(encoding="utf-8"))
    cfg.setdefault("forms_tracked", ["4", "4/A"])
    cfg.setdefault("push_tiers", ["HIGH"])
    cfg.setdefault("thresholds", {"large_sale_usd": 10_000_000, "large_sale_pct": 25})
    cfg.setdefault("filing_hours_et", {"start": 6, "end": 23, "weekdays_only": True})
    cfg.setdefault("notifier", "telegram")
    cfg.setdefault("watchlist_source", "config/companies.json")
    return cfg


def load_watchlist(cfg: dict) -> list[dict]:
    path = REPO / cfg["watchlist_source"]
    return json.loads(path.read_text(encoding="utf-8"))["companies"]


# --------------------------------------------------------------------------- #
# time window (US Eastern, DST-aware, no tzdata dependency)
# --------------------------------------------------------------------------- #
def _nth_weekday(year: int, month: int, weekday: int, n: int) -> int:
    """Day-of-month of the n-th `weekday` (Mon=0..Sun=6) in month."""
    from calendar import monthrange
    first_wd, _days = monthrange(year, month)
    offset = (weekday - first_wd) % 7
    return 1 + offset + (n - 1) * 7


def us_eastern_now() -> datetime:
    now = datetime.now(timezone.utc)
    y = now.year
    # DST: 2nd Sunday of March 02:00 EST(=07:00 UTC) .. 1st Sunday of Nov 02:00 EDT(=06:00 UTC)
    dst_start = datetime(y, 3, _nth_weekday(y, 3, 6, 2), 7, tzinfo=timezone.utc)
    dst_end = datetime(y, 11, _nth_weekday(y, 11, 6, 1), 6, tzinfo=timezone.utc)
    is_dst = dst_start <= now < dst_end
    return now + timedelta(hours=-4 if is_dst else -5)


def within_filing_hours(cfg: dict) -> bool:
    fh = cfg["filing_hours_et"]
    et = us_eastern_now()
    if fh.get("weekdays_only", True) and et.weekday() >= 5:
        return False
    return fh["start"] <= et.hour < fh["end"]


# --------------------------------------------------------------------------- #
# SEC fetch
# --------------------------------------------------------------------------- #
def fetch_tracked_filings(cik: int, tracked: set[str]) -> list[dict]:
    """Fresh submissions -> list of tracked-form filings (newest first)."""
    j = _fetch_json(f"https://data.sec.gov/submissions/CIK{cik:010d}.json")
    r = j["filings"]["recent"]
    out = []
    for acc, form, date, primary in zip(
        r["accessionNumber"], r["form"], r["filingDate"], r["primaryDocument"]
    ):
        if form in tracked:
            accn = acc.replace("-", "")
            raw = primary.rsplit("/", 1)[-1]  # strip xslF345X0n/ prefix -> raw XML
            base = f"https://www.sec.gov/Archives/edgar/data/{cik}/{accn}"
            out.append({
                "accession": acc, "form": form, "date": date,
                "view_url": f"{base}/{primary}",  # human-friendly rendered page
                "xml_url": f"{base}/{raw}",        # machine-parseable Form 4 XML
            })
    return out


# --------------------------------------------------------------------------- #
# Form 4 parse (deterministic; consolidates read_form4 + insider_latest logic)
# --------------------------------------------------------------------------- #
def _t(node, path):
    el = node.find(path) if node is not None else None
    return el.text.strip() if el is not None and el.text else None


def _f(s):
    try:
        return float(s) if s not in (None, "") else None
    except ValueError:
        return None


def parse_ownership(xml: str) -> dict:
    root = ET.fromstring(xml)
    owner = _t(root, ".//reportingOwner/reportingOwnerId/rptOwnerName") or "?"
    rel = root.find(".//reportingOwner/reportingOwnerRelationship")
    roles: list[str] = []
    if rel is not None:
        if _t(rel, "isDirector") in ("1", "true"):
            roles.append("Director")
        if _t(rel, "isOfficer") in ("1", "true"):
            roles.append(_t(rel, "officerTitle") or "Officer")
        if _t(rel, "isTenPercentOwner") in ("1", "true"):
            roles.append("10% Owner")
        if _t(rel, "isOther") in ("1", "true"):
            roles.append(_t(rel, "otherText") or "Other")

    foot = " ".join((fn.text or "") for fn in root.findall(".//footnotes/footnote")).lower()
    aff = root.find(".//aff10b5One")
    has_10b51 = (
        (aff is not None and (aff.text or "").strip() in ("1", "true"))
        or "10b5-1" in foot
        or "10b5–1" in foot  # en-dash variant sometimes used
    )

    txns = []
    for t in root.findall(".//nonDerivativeTable/nonDerivativeTransaction"):
        txns.append({
            "date": _t(t, "transactionDate/value"),
            "code": _t(t, "transactionCoding/transactionCode"),
            "acq_disp": _t(t, "transactionAmounts/transactionAcquiredDisposedCode/value"),
            "shares": _f(_t(t, "transactionAmounts/transactionShares/value")),
            "price": _f(_t(t, "transactionAmounts/transactionPricePerShare/value")),
            "after": _f(_t(t, ".//sharesOwnedFollowingTransaction/value")),
        })
    return {"owner": owner, "roles": roles, "has_10b51": has_10b51, "txns": txns}


# --------------------------------------------------------------------------- #
# classify (pure rules)
# --------------------------------------------------------------------------- #
def _aggregate(txns: list[dict], codes: set[str]):
    rows = [t for t in txns if t["code"] in codes and t["shares"]]
    if not rows:
        return None
    sh = sum(t["shares"] for t in rows)
    val = sum((t["shares"] or 0) * (t["price"] or 0) for t in rows)
    # NOTE: `after` is the shares-owned-following-transaction on the LAST lot in
    # THIS filing only. It is NOT total holdings: a sold-out vested tranche shows
    # after=0 even when the insider still owns millions elsewhere. Treat as a raw
    # "still held after this filing" hint, never as a "% of position" figure.
    afters = [t["after"] for t in rows if t["after"] is not None]
    after = min(afters) if afters else None
    dates = [t["date"] for t in rows if t["date"]]
    avg = val / sh if sh else 0.0
    return {"shares": sh, "value": val, "price": avg, "after": after,
            "txn_date": max(dates) if dates else None}


def classify(parsed: dict, cfg: dict):
    """Returns (tier, reason, agg_or_None). Rule-based, 10b5-1-aware.

    BUY (code P)            -> always HIGH (rare, high-signal)
    discretionary SELL      -> HIGH if value >= discretionary_sale_usd
    10b5-1 pre-planned SELL -> HIGH only if value >= plan_sale_usd (much higher bar)
    grants / exercises / tax / gifts -> LOW (never pushed under HIGH-only config)
    """
    th = cfg["thresholds"]
    buys = _aggregate(parsed["txns"], {"P"})
    if buys and buys["shares"] > 0:
        buys["action"] = "buy"
        return "HIGH", "open_market_buy", buys
    sells = _aggregate(parsed["txns"], {"S"})
    if sells and sells["shares"] > 0:
        sells["action"] = "sell"
        if parsed["has_10b51"]:
            limit, reason = th["plan_sale_usd"], "large_plan_sale"
        else:
            limit, reason = th["discretionary_sale_usd"], "discretionary_sale"
        if sells["value"] >= limit:
            return "HIGH", reason, sells
        return "MEDIUM", "ordinary_sale", sells
    return "LOW", "routine", None


# --------------------------------------------------------------------------- #
# message formatting
# --------------------------------------------------------------------------- #
def _fmt_usd(v) -> str:
    if not v:
        return "—"
    a = abs(v)
    if a >= 1e9:
        return f"${v / 1e9:.2f}B"
    if a >= 1e6:
        return f"${v / 1e6:.2f}M"
    if a >= 1e3:
        return f"${v / 1e3:.1f}K"
    return f"${v:,.0f}"


def build_message(tier: str, reason: str, agg: dict, parsed: dict, meta: dict) -> str:
    emoji = _TIER_EMOJI[tier]
    ticker = meta["ticker"]
    amend = "（修正 4/A）" if meta["form"] == "4/A" else ""
    action_zh = "內部人買進" if agg["action"] == "buy" else "內部人賣出"
    verb = "買進" if agg["action"] == "buy" else "賣出"
    roles = "/".join(parsed["roles"]) or "—"

    lines = [f"{emoji} <b>{ticker}</b> {action_zh}{amend}",
             f"{html.escape(parsed['owner'])} · {html.escape(roles)}"]

    line = f"{verb} {agg['shares']:,.0f} 股"
    if agg["price"]:
        line += f" @ ${agg['price']:,.2f}"
    if agg["value"]:
        line += f" ＝ <b>{_fmt_usd(agg['value'])}</b>"
    lines.append(line)

    if agg["action"] == "sell" and agg.get("after"):
        lines.append(f"本次申報後此批仍持有 {agg['after']:,.0f} 股")

    lines.append(f"交易日 {agg['txn_date'] or meta['filing_date']} · 申報 {meta['filing_date']}")
    lines.append(f"10b5-1 計畫：{'是 ✓' if parsed['has_10b51'] else '否/未註明'}")
    if reason == "discretionary_sale":
        lines.append("⚠️ 非計畫性賣出（自主決定，訊號較強）")
    elif reason == "large_plan_sale":
        lines.append("⚠️ 大額計畫性賣出")
    lines.append(f'\U0001F517 <a href="{meta["view_url"]}">SEC 原文</a>')
    return "\n".join(lines)


# --------------------------------------------------------------------------- #
# state
# --------------------------------------------------------------------------- #
def load_state():
    if STATE_FILE.exists():
        return json.loads(STATE_FILE.read_text(encoding="utf-8"))
    return None


def save_state(state: dict) -> None:
    STATE_FILE.parent.mkdir(parents=True, exist_ok=True)
    tmp = STATE_FILE.with_suffix(".tmp")
    tmp.write_text(json.dumps(state, ensure_ascii=False, indent=2), encoding="utf-8")
    tmp.replace(STATE_FILE)


def make_logger():
    LOG_FILE.parent.mkdir(parents=True, exist_ok=True)

    def log(msg: str) -> None:
        line = f"{datetime.now():%Y-%m-%d %H:%M:%S}  {msg}"
        print(line)
        with open(LOG_FILE, "a", encoding="utf-8") as fh:
            fh.write(line + "\n")

    return log


# --------------------------------------------------------------------------- #
# operations
# --------------------------------------------------------------------------- #
def seed(cfg: dict, log) -> None:
    companies = load_watchlist(cfg)
    tracked = set(cfg["forms_tracked"])
    state = {"seeded_at": datetime.now(timezone.utc).isoformat(), "companies": {}}
    total = 0
    for c in companies:
        cik = int(c["cik"])
        try:
            filings = fetch_tracked_filings(cik, tracked)
        except Exception as e:  # noqa: BLE001
            log(f"[seed warn] {c['ticker']}: {e!r}")
            filings = []
        dates = [f["date"] for f in filings]
        state["companies"][str(cik)] = {
            "ticker": c["ticker"],
            # high-water mark: only filings dated >= this are ever considered "new".
            # Guards against the seen-list cap resurfacing old filings as new.
            "watermark": max(dates) if dates else "",
            "seen": [f["accession"] for f in filings][:400],
        }
        total += len(filings)
    save_state(state)
    log(f"[seed] recorded {total} existing filings across {len(companies)} companies; NO alerts sent.")


def run_poll(cfg: dict, notifier, state: dict, log) -> dict:
    companies = load_watchlist(cfg)
    tracked = set(cfg["forms_tracked"])
    push_tiers = set(cfg["push_tiers"])
    new_total = scanned = pushed = 0

    for c in companies:
        cik = int(c["cik"])
        ticker = c["ticker"]
        st = state["companies"].setdefault(str(cik), {"ticker": ticker, "watermark": "", "seen": []})
        seen = set(st["seen"])
        wm = st.get("watermark", "")
        try:
            filings = fetch_tracked_filings(cik, tracked)
        except Exception as e:  # noqa: BLE001
            log(f"[warn] {ticker} submissions fetch failed: {e!r}")
            continue

        # "new" = never seen AND dated on/after the high-water mark (skips old filings
        # that fall outside the bounded seen-list). filingDate is monotonic in practice.
        new = [f for f in filings if f["accession"] not in seen and (not wm or f["date"] >= wm)]
        # submissions is newest-first; process oldest-first so pushes arrive in order
        for f in reversed(new):
            new_total += 1
            if f["form"] in ("4", "4/A"):
                try:
                    parsed = parse_ownership(_fetch_text(f["xml_url"]))
                    tier, reason, agg = classify(parsed, cfg)
                    scanned += 1
                    if tier in push_tiers and agg:
                        meta = {"ticker": ticker, "form": f["form"],
                                "view_url": f["view_url"], "filing_date": f["date"]}
                        ok = notifier.send(build_message(tier, reason, agg, parsed, meta))
                        pushed += 1
                        log(f"[push:{'ok' if ok else 'FAIL'}] {ticker} {tier} {reason} "
                            f"{parsed['owner']} {f['accession']}")
                except Exception as e:  # noqa: BLE001
                    log(f"[warn] {ticker} parse {f['accession']} failed: {e!r}")
            st["seen"].append(f["accession"])  # mark seen regardless of parse outcome
        all_dates = [f["date"] for f in filings]
        if all_dates:
            st["watermark"] = max(wm, max(all_dates)) if wm else max(all_dates)
        st["seen"] = st["seen"][-400:]
        st["ticker"] = ticker

    return {"new": new_total, "scanned": scanned, "pushed": pushed}


def run_dry(cfg: dict, days: int) -> None:
    cutoff = (datetime.now().date() - timedelta(days=days)).isoformat()
    companies = load_watchlist(cfg)
    push_tiers = set(cfg["push_tiers"])
    console = ConsoleNotifier()
    n_seen = n_push = 0
    print(f"[dry-run] Form 4/4-A in last {days}d (>= {cutoff}); push tiers = {sorted(push_tiers)}\n")
    for c in companies:
        cik = int(c["cik"])
        try:
            filings = [f for f in fetch_tracked_filings(cik, {"4", "4/A"}) if f["date"] >= cutoff]
        except Exception as e:  # noqa: BLE001
            print(f"  {c['ticker']}: fetch failed {e!r}")
            continue
        for f in filings:
            n_seen += 1
            try:
                parsed = parse_ownership(_fetch_text(f["xml_url"]))
                tier, reason, agg = classify(parsed, cfg)
            except Exception as e:  # noqa: BLE001
                print(f"  {c['ticker']} {f['accession']} parse fail {e!r}")
                continue
            if tier in push_tiers and agg:
                n_push += 1
                meta = {"ticker": c["ticker"], "form": f["form"],
                        "view_url": f["view_url"], "filing_date": f["date"]}
                console.send(build_message(tier, reason, agg, parsed, meta))
    print(f"\n[dry-run] {n_seen} filings scanned, {n_push} WOULD have pushed (nothing sent, state untouched).")


# --------------------------------------------------------------------------- #
# entry point
# --------------------------------------------------------------------------- #
def main() -> None:
    ap = argparse.ArgumentParser(description="SEC insider-filing alerter (rule-based, zero-token)")
    ap.add_argument("--force", action="store_true", help="ignore the ET filing-hours window")
    ap.add_argument("--seed", action="store_true", help="(re)seed state silently and exit")
    ap.add_argument("--dry-run", action="store_true", help="classify recent filings and PRINT; no send, no state change")
    ap.add_argument("--days", type=int, default=30, help="[--dry-run] lookback window in days")
    ap.add_argument("--test", action="store_true", help="send a test message via the configured notifier")
    ap.add_argument("--get-chat-id", action="store_true", help="[telegram] print chat ids from recent bot messages")
    args = ap.parse_args()

    cfg = load_config()

    if args.get_chat_id:
        TelegramNotifier().print_chat_ids()
        return
    if args.test:
        n = build_notifier(cfg["notifier"])
        if not n.configured:
            print("Notifier not configured. Copy config/secrets.example.json -> secrets.local.json and fill it in.")
            return
        print("sent ✓" if n.send("✅ SEC 內部人快報：測試訊息，通道正常。") else "FAILED")
        return
    if args.dry_run:
        run_dry(cfg, args.days)
        return

    log = make_logger()

    if args.seed:
        seed(cfg, log)
        return

    if not args.force and not within_filing_hours(cfg):
        return  # silent, zero-cost no-op outside ET filing hours

    state = load_state()
    if state is None:
        seed(cfg, log)  # first ever run: seed silently; genuinely-new filings alert next run
        return

    notifier = build_notifier(cfg["notifier"])
    if not notifier.configured:
        log("[error] notifier not configured; skipping. See config/secrets.example.json")
        return

    summary = run_poll(cfg, notifier, state, log)
    save_state(state)
    if summary["new"]:
        log(f"[poll] new={summary['new']} form4_scanned={summary['scanned']} pushed={summary['pushed']}")


if __name__ == "__main__":
    main()
