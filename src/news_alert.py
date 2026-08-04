"""
News-alert orchestrator.  REST fetch -> dedup -> LLM judge -> Telegram.

Layers (all reuse the insider layer's throttled SEC client + notifier):
  fetch (Benzinga firehose+local filter / Finnhub+text-gate / SEC 8-K)  -- 0 token
  dedup vs data/news/state.json + title-dedup                            -- 0 token
  LLM judge (relevance + materiality 0-100), provider-pluggable          -- tokens
  push materiality >= threshold to Telegram                              -- 0 token

Usage:
  python src/news_alert.py --review          # fetch recent, JUDGE, print ranked; no state, no push (manual "digest")
  python src/news_alert.py --review --days 3
  python src/news_alert.py --dry-run         # fetch & print candidates, NO judge (0 token)
  python src/news_alert.py --seed            # record current items silently and exit
  python src/news_alert.py                    # one poll cycle (Task Scheduler); judges+pushes only if judge.enabled
  python src/news_alert.py --force            # ignore the ET filing-hours window
"""
from __future__ import annotations

import argparse
import html
import json
import sys
import time
from datetime import datetime
from pathlib import Path

try:
    sys.stdout.reconfigure(encoding="utf-8")
except Exception:
    pass

ROOT = Path(__file__).resolve().parent
sys.path.insert(0, str(ROOT))
from insider_alert import within_filing_hours, load_watchlist  # noqa: E402  (reuse)
from news_sources import fetch_all  # noqa: E402
from news_judge import cluster_by_event, dedupe_by_title, judge, merge_events, _event_key  # noqa: E402
from notifier import build_notifier  # noqa: E402

REPO = ROOT.parent
CONFIG_FILE = REPO / "config" / "news_config.json"
SECRETS_FILE = REPO / "config" / "secrets.local.json"
STATE_FILE = REPO / "data" / "news" / "state.json"
LOG_FILE = REPO / "data" / "news" / "news.log"

SOURCE_TAG = {"benzinga": "BZ", "finnhub": "FH", "sec_8k": "8K"}
_DIR_ZH = {"bullish": "看多", "bearish": "看空", "neutral": "中性"}


def load_config() -> dict:
    return json.loads(CONFIG_FILE.read_text(encoding="utf-8"))


def load_secrets() -> dict:
    return json.loads(SECRETS_FILE.read_text(encoding="utf-8")) if SECRETS_FILE.exists() else {}


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


def _recent(items: list[dict], days: int) -> list[dict]:
    cutoff = time.time() - days * 86400
    return [it for it in items if (it.get("published") or cutoff) >= cutoff]


def _tier_emoji(m: int) -> str:
    return "\U0001F534" if m >= 70 else ("\U0001F7E1" if m >= 40 else "⚪")


def _age_str(published) -> str:
    """Human age of an article, e.g. '3分鐘前' / '2小時前'. '' if unknown."""
    if not published:
        return ""
    mins = (time.time() - published) / 60
    if mins < 1:
        return "剛剛"
    if mins < 60:
        return f"{int(mins)}分鐘前"
    hrs = mins / 60
    if hrs < 24:
        return f"{int(round(hrs))}小時前"
    return f"{int(round(hrs / 24))}天前"


def build_message(item: dict) -> str:
    v = item["verdict"]
    m = v["materiality"]
    emoji = _tier_emoji(m)
    tickers = ",".join(item["tickers"])
    src = SOURCE_TAG.get(item["source"], item["source"])
    dup = item.get("dup_count", 1)
    cov = f" · {dup} 則報導" if dup > 1 else ""
    url = item.get("url") or ""
    title = html.escape(item["title"])
    title_line = f'<a href="{url}">{title}</a>' if url else title  # headline itself is tappable
    age = _age_str(item.get("published"))
    src_age = f"{src} · {age}" if age else src
    link_line = (f'\U0001F4F0 {src_age} · <a href="{url}">\U0001F517 開啟原文</a>' if url
                 else f'\U0001F4F0 {src_age}')
    lines = [
        f"{emoji} <b>{tickers}</b> · 重要性 {m} · {_DIR_ZH.get(v['direction'], v['direction'])}{cov}",
        title_line,
        html.escape(v.get("why", "")),
        link_line,
    ]
    return "\n".join(l for l in lines if l)


# --------------------------------------------------------------------------- #
# --review : fetch recent, judge, print ranked. No state, no push.
# --------------------------------------------------------------------------- #
def run_review(cfg: dict, secrets: dict, days: int) -> None:
    companies = load_watchlist(cfg)
    items = _recent(fetch_all(cfg, secrets, companies), days)
    merged = dedupe_by_title(items)
    print(f"[review] {len(items)} items -> {len(merged)} after title-dedup; judging via "
          f"{cfg['judge'].get('provider')}/{cfg['judge'].get('model')} ...")
    merged, usage = judge(merged, companies, cfg, secrets)
    events = cluster_by_event([it for it in merged if it.get("verdict")])
    cands = [it for it in events if it["verdict"]["relevant"] and it["verdict"]["materiality"] >= 40]
    n_pre = len(cands)
    cands, u2 = merge_events(cands, cfg, secrets)
    cands.sort(key=lambda it: it["verdict"]["materiality"], reverse=True)
    print(f"[review] {len(merged)} judged -> {len(events)} title/event clusters -> "
          f"{n_pre} candidates (m>=40) -> {len(cands)} after semantic merge.")

    def show(title, lo, hi):
        rows = [it for it in cands if lo <= it["verdict"]["materiality"] <= hi]
        if not rows:
            return
        print(f"\n{title}  ({len(rows)})")
        for it in rows:
            v = it["verdict"]
            dup = f" (+{it['dup_count'] - 1} dup)" if it.get("dup_count", 1) > 1 else ""
            age = _age_str(it.get("published"))
            print(f"  {_tier_emoji(v['materiality'])} [{v['materiality']:>3}] "
                  f"{','.join(it['tickers'])}{(' ' + age) if age else ''} "
                  f"{_DIR_ZH.get(v['direction'], v['direction'])} — {it['title']}{dup}")
            print(f"        {v['why']}  «{v.get('event', '')}»")

    show("🔴 HIGH (would push)", 70, 100)
    show("🟡 MEDIUM", 40, 69)
    tin = usage["prompt_tokens"] + u2["prompt_tokens"]
    tout = usage["completion_tokens"] + u2["completion_tokens"]
    print(f"\n[review] tokens: {tin} in / {tout} out (~pennies).")


# --------------------------------------------------------------------------- #
# poll / seed
# --------------------------------------------------------------------------- #
def seed(cfg: dict, secrets: dict, log) -> None:
    companies = load_watchlist(cfg)
    items = fetch_all(cfg, secrets, companies)
    state = {"seeded_at": datetime.now().isoformat(),
             "seen": [it["uid"] for it in items][-6000:],
             "pending": [], "last_judge_ts": 0, "pushed_events": {}}
    save_state(state)
    log(f"[seed] recorded {len(items)} current items across {len(companies)} companies; NO alerts sent.")


def run_poll(cfg: dict, secrets: dict, state: dict, log) -> None:
    companies = load_watchlist(cfg)
    items = fetch_all(cfg, secrets, companies)
    now = time.time()
    seen = set(state.get("seen", []))
    new = [it for it in items if it["uid"] not in seen]
    for it in new:
        state["seen"].append(it["uid"])
    state["seen"] = state["seen"][-6000:]

    jc = cfg.get("judge", {})
    if not jc.get("enabled"):
        if new:
            for it in new:
                log(f"[new] [{SOURCE_TAG.get(it['source'], it['source'])}] "
                    f"{','.join(it['tickers'])}: {it['title']}")
            log(f"[poll] {len(new)} new items captured (judge disabled — not pushed).")
        return

    # Freshness cap: only queue items still fresh when first seen — drops stale rehashes
    # and slow-surfacing aggregator content. Items with no publish time are kept.
    max_age = jc.get("max_age_hours", 4) * 3600
    fresh = [it for it in new if not it.get("published") or (now - it["published"]) <= max_age]

    pending = state.setdefault("pending", [])
    pending.extend(fresh)
    due = (len(pending) >= jc.get("queue_trigger", 12)
           or (pending and now - state.get("last_judge_ts", 0) >= jc.get("cadence_min", 15) * 60))
    if not due:
        return

    merged = dedupe_by_title(pending)
    n_queued = len(pending)
    merged, usage = judge(merged, companies, cfg, secrets)
    if merged and not any(it.get("verdict") for it in merged):
        log(f"[warn] judge produced 0 verdicts for {len(merged)} items — provider "
            f"'{jc.get('provider')}' may be down (codex login/subscription expired?).")
    events = cluster_by_event([it for it in merged if it.get("verdict")])
    state["pending"] = []
    state["last_judge_ts"] = now

    threshold = jc.get("materiality_push_threshold", 85)
    push_cands = [it for it in events if it["verdict"].get("relevant")
                  and it["verdict"].get("materiality", 0) >= threshold]
    push_cands, u2 = merge_events(push_cands, cfg, secrets)

    # Cross-time event dedup: suppress events already pushed within suppress_repeat_days.
    suppress = jc.get("suppress_repeat_days", 4) * 86400
    pushed_events = state.setdefault("pushed_events", {})
    for k in [k for k, ts in pushed_events.items() if now - ts > suppress]:
        del pushed_events[k]

    notifier = build_notifier(cfg.get("notifier", "telegram"))
    pushed = suppressed = 0
    for it in push_cands:
        ek = _event_key(it)
        if ek in pushed_events:
            suppressed += 1
            log(f"[skip:seen-event] {','.join(it['tickers'])} {it['title']}")
            continue
        ok = notifier.send(build_message(it))
        pushed_events[ek] = now
        pushed += 1
        log(f"[push:{'ok' if ok else 'FAIL'}] {','.join(it['tickers'])} "
            f"m={it['verdict']['materiality']} ({it.get('dup_count', 1)}x) {it['title']}")
    log(f"[poll] queued {n_queued} -> {len(events)} events -> pushed {pushed} "
        f"(suppressed {suppressed} repeats); tokens {usage['prompt_tokens'] + u2['prompt_tokens']}/"
        f"{usage['completion_tokens'] + u2['completion_tokens']}.")


def main() -> None:
    ap = argparse.ArgumentParser(description="News alerter (fetch + dedup + LLM judge + push)")
    ap.add_argument("--review", action="store_true", help="fetch recent, JUDGE, print ranked; no state, no push")
    ap.add_argument("--dry-run", action="store_true", help="fetch & print candidates, NO judge (0 token)")
    ap.add_argument("--days", type=int, default=7, help="[--review/--dry-run] recency window")
    ap.add_argument("--seed", action="store_true", help="record current items silently and exit")
    ap.add_argument("--force", action="store_true", help="ignore the ET filing-hours window")
    args = ap.parse_args()

    cfg = load_config()
    secrets = load_secrets()

    if args.review:
        run_review(cfg, secrets, args.days)
        return
    if args.dry_run:
        companies = load_watchlist(cfg)
        items = _recent(fetch_all(cfg, secrets, companies), args.days)
        items.sort(key=lambda x: x.get("published") or 0, reverse=True)
        print(f"[dry-run] {len(items)} watchlist items (no judge).")
        for it in items[:60]:
            print(f"  [{SOURCE_TAG.get(it['source'], it['source'])}] {','.join(it['tickers'])}: {it['title']}")
        return

    log = make_logger()
    if args.seed:
        seed(cfg, secrets, log)
        return
    if not args.force and not within_filing_hours(cfg):
        return
    state = load_state()
    if state is None:
        seed(cfg, secrets, log)
        return
    run_poll(cfg, secrets, state, log)
    save_state(state)


if __name__ == "__main__":
    main()
