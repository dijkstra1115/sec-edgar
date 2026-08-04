"""
LLM judge for the news layer — provider-pluggable, raw HTTP (no provider SDK).

Takes a batch of normalized news items and returns a per-item verdict:
  {relevant: bool, materiality: 0-100, direction: bullish|bearish|neutral, why: str}

`config.judge.provider` selects the backend ("openai" now; "anthropic" hook left
in place). Keys come from env (OPENAI_API_KEY / ANTHROPIC_API_KEY) or
secrets.local.json. Validated live on gpt-5.4-mini (strict json_schema output).
"""
from __future__ import annotations

import json
import os
import re
import subprocess
import urllib.request
from pathlib import Path

_BATCH = 30  # items per LLM call (larger => same-event headlines co-occur => more consistent event labels)

_SYSTEM = """You are a financial news analyst screening headlines for a US-stock watchlist.
For each numbered item decide:
- relevant: is it genuinely ABOUT the listed ticker's company, not just a passing mention or a listicle that happens to name it?
- materiality (0-100): how likely is it to MOVE that stock?
  HIGH (70-100): earnings/guidance, M&A, major customer/supply deals, regulatory or legal action, executive changes, analyst rating or price-target changes, significant product/operational milestones, unexpected strategic moves.
  MEDIUM (40-69): notable but not decisive — partnerships, minor analyst notes, index inclusion, sector moves that clearly hit this name.
  LOW (0-39): opinion / analysis / prediction / ranking / listicles ("should you buy", "best stocks to buy", "N unstoppable stocks", "prediction:", "why X is a buy", "ranking the best", "X's next forever holding", "here's why"), retrospectives or explainers that REHASH an already-known development, routine recaps, generic valuation screens, sponsorships, personal-finance filler, or articles mainly about a DIFFERENT company that only cross-mention this ticker. Score these LOW even when they reference a real event — only the PRIMARY, first-hand breaking report of an event earns HIGH.
- direction: bullish, bearish, or neutral for that ticker.
- why: one short clause.
- event: a short canonical lowercase label (2-5 words) naming the UNDERLYING event, IDENTICAL for every headline about the same event so duplicates can be grouped. Name the event itself, not the outlet or opinion. E.g. all headlines about Microsoft's $2.5B Frontier AI unit -> "microsoft frontier ai unit"; all Tesla Q2 delivery-beat stories -> "tesla q2 deliveries beat"; an analyst upgrade -> "<ticker> analyst upgrade".
Return one entry per numbered item, with the same n. JSON only, per the schema."""

_SCHEMA = {
    "type": "object",
    "properties": {
        "items": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {
                    "n": {"type": "integer"},
                    "relevant": {"type": "boolean"},
                    "materiality": {"type": "integer"},
                    "direction": {"type": "string", "enum": ["bullish", "bearish", "neutral"]},
                    "why": {"type": "string"},
                    "event": {"type": "string"},
                },
                "required": ["n", "relevant", "materiality", "direction", "why", "event"],
                "additionalProperties": False,
            },
        }
    },
    "required": ["items"],
    "additionalProperties": False,
}


def _norm_title(t: str) -> str:
    return re.sub(r"[^a-z0-9]+", " ", (t or "").lower()).strip()


def dedupe_by_title(items: list[dict]) -> list[dict]:
    """Merge items sharing a normalized title (same story cross-tagged to many
    tickers); union their tickers. Cuts LLM volume/cost."""
    seen: dict[str, dict] = {}
    for it in items:
        key = _norm_title(it["title"]) or it["uid"]
        if key in seen:
            m = seen[key]
            m["tickers"] = sorted(set(m["tickers"]) | set(it["tickers"]))
            m.setdefault("_uids", []).append(it["uid"])
        else:
            m = dict(it)
            m["_uids"] = [it["uid"]]
            seen[key] = m
    return list(seen.values())


def _event_key(item: dict) -> str:
    v = item.get("verdict") or {}
    lbl = re.sub(r"[^a-z0-9]+", " ", (v.get("event") or "").lower()).strip()
    return lbl or _norm_title(item.get("title", "")) or item["uid"]


def cluster_by_event(items: list[dict]) -> list[dict]:
    """Collapse judged items that share an `event` label into ONE representative
    (highest materiality), merging tickers. Kills near-duplicate coverage (the
    same event reported by many outlets with different headlines). Returns reps
    with `dup_count` = how many headlines the event had."""
    groups: dict[str, list[dict]] = {}
    for it in items:
        if not it.get("verdict"):
            continue
        groups.setdefault(_event_key(it), []).append(it)
    reps = []
    for g in groups.values():
        g.sort(key=lambda it: (it["verdict"]["materiality"], len(it["tickers"])), reverse=True)
        rep = dict(g[0])
        rep["tickers"] = sorted({t for it in g for t in it["tickers"]})
        rep["dup_count"] = len(g)
        reps.append(rep)
    return reps


def _resolve_key(provider: str, secrets: dict) -> str | None:
    if provider == "openai":
        return os.environ.get("OPENAI_API_KEY") or secrets.get("openai_api_key")
    if provider == "anthropic":
        return os.environ.get("ANTHROPIC_API_KEY") or secrets.get("anthropic_api_key")
    return None


def _watchlist_context(companies: list[dict]) -> str:
    return "; ".join(f"{c['ticker']}={c['name']}" for c in companies)


def _openai_batch(model: str, key: str, system: str, user: str,
                  schema: dict, schema_name: str = "verdicts") -> tuple[dict, dict]:
    body = {
        "model": model,
        "messages": [
            {"role": "system", "content": system},
            {"role": "user", "content": user},
        ],
        "response_format": {
            "type": "json_schema",
            "json_schema": {"name": schema_name, "strict": True, "schema": schema},
        },
    }
    req = urllib.request.Request(
        "https://api.openai.com/v1/chat/completions",
        data=json.dumps(body).encode(),
        headers={"Authorization": f"Bearer {key}", "Content-Type": "application/json"},
    )
    with urllib.request.urlopen(req, timeout=90) as resp:
        data = json.loads(resp.read())
    content = data["choices"][0]["message"]["content"]
    return json.loads(content), data.get("usage", {})


def _codex_batch(codex_cfg: dict, system: str, user: str, schema: dict) -> tuple[dict, dict]:
    """Judge via the local Codex CLI (ChatGPT-subscription auth) instead of the API.
    Pipes the prompt into `codex exec` through PowerShell (Get-Content | codex) so
    stdin gets EOF — otherwise codex blocks forever reading stdin. Structured output
    is enforced with --output-schema and captured from the -o file. Windows-only."""
    base = Path(__file__).resolve().parent.parent / "data" / "news"
    base.mkdir(parents=True, exist_ok=True)
    pid = os.getpid()
    pf = base / f"_codex_prompt_{pid}.txt"
    sf = base / f"_codex_schema_{pid}.json"
    of = base / f"_codex_out_{pid}.json"
    pf.write_text(system + "\n\n" + user, encoding="utf-8")
    sf.write_text(json.dumps(schema), encoding="utf-8")
    if of.exists():
        of.unlink()
    effort = codex_cfg.get("reasoning_effort", "low")
    model = codex_cfg.get("model", "")
    inner = (f"Get-Content -Raw -LiteralPath '{pf}' | "
             f"codex exec --skip-git-repo-check --ephemeral -s read-only "
             f"-c model_reasoning_effort={effort} "
             + (f"-m {model} " if model else "")
             + f"--output-schema '{sf}' -o '{of}'")
    def _dbg(msg):
        try:
            with open(base / "_codex_debug.log", "a", encoding="utf-8") as fh:
                fh.write(msg + "\n")
        except OSError:
            pass
    try:
        try:
            proc = subprocess.run(
                # -ExecutionPolicy Bypass: `codex` resolves to codex.ps1; under the
                # Task Scheduler session the default policy blocks unsigned .ps1
                # (PSSecurityException) so codex never runs. Bypass fixes it.
                ["powershell", "-NoProfile", "-ExecutionPolicy", "Bypass", "-Command", inner],
                capture_output=True, text=True,
                timeout=codex_cfg.get("timeout_sec", 180),
                creationflags=getattr(subprocess, "CREATE_NO_WINDOW", 0),  # no console flash under pythonw
            )
        except Exception as e:  # noqa: BLE001
            _dbg(f"[pid {pid}] subprocess raised: {e!r}")
            raise
        content = of.read_text(encoding="utf-8").strip() if of.exists() else ""
        if not content:
            _dbg(f"[pid {pid}] no output. exit={proc.returncode}\n"
                 f"--STDERR--\n{proc.stderr}\n--STDOUT--\n{proc.stdout}\n--END--")
            raise RuntimeError(f"codex produced no output (exit {proc.returncode}): "
                               f"{(proc.stderr or proc.stdout or '')[:300]}")
        return json.loads(content), {"prompt_tokens": 0, "completion_tokens": 0}
    finally:
        for p in (pf, sf, of):
            try:
                p.unlink()
            except OSError:
                pass


def _llm_json(cfg: dict, secrets: dict, system: str, user: str,
              schema: dict, schema_name: str) -> tuple[dict, dict]:
    """Provider dispatcher. Returns (parsed_json, usage). No fallback — if the
    selected provider fails, the caller sees the error (and pushes nothing)."""
    jc = cfg.get("judge", {})
    provider = jc.get("provider", "openai")
    if provider == "openai":
        key = _resolve_key("openai", secrets)
        if not key:
            raise RuntimeError("no OpenAI API key")
        return _openai_batch(jc.get("model", "gpt-5.4-mini"), key, system, user, schema, schema_name)
    if provider == "codex_cli":
        return _codex_batch(jc.get("codex", {}), system, user, schema)
    raise RuntimeError(f"unknown judge provider {provider!r}")


def judge(items: list[dict], companies: list[dict], cfg: dict, secrets: dict):
    """Attach a `verdict` dict to each item. Returns (items, usage_totals).
    Items whose batch fails get verdict=None (treated as not-pushable)."""
    usage = {"prompt_tokens": 0, "completion_tokens": 0}
    ctx = _watchlist_context(companies)
    system = f"{_SYSTEM}\nWatchlist companies: {ctx}."

    for it in items:
        it["verdict"] = None

    for start in range(0, len(items), _BATCH):
        chunk = items[start:start + _BATCH]
        lines = []
        for i, it in enumerate(chunk, 1):
            summ = (it.get("summary") or "")[:200]
            lines.append(f"{i}) {','.join(it['tickers'])} | {it['title']}\n   {summ}")
        user = "Judge these:\n" + "\n".join(lines)
        try:
            parsed, u = _llm_json(cfg, secrets, system, user, _SCHEMA, "verdicts")
        except Exception as e:  # noqa: BLE001
            print(f"[judge] batch {start}-{start + len(chunk)} failed: {e!r}")
            continue
        usage["prompt_tokens"] += u.get("prompt_tokens", 0)
        usage["completion_tokens"] += u.get("completion_tokens", 0)
        by_n = {v["n"]: v for v in parsed.get("items", [])}
        for i, it in enumerate(chunk, 1):
            it["verdict"] = by_n.get(i)

    return items, usage


_MERGE_SCHEMA = {
    "type": "object",
    "properties": {
        "items": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {"n": {"type": "integer"}, "group": {"type": "integer"}},
                "required": ["n", "group"],
                "additionalProperties": False,
            },
        }
    },
    "required": ["items"],
    "additionalProperties": False,
}

_MERGE_SYSTEM = (
    "You are de-duplicating financial-news EVENTS. Each numbered line is one news item. "
    "Assign each a group number: items reporting the SAME underlying real-world event "
    "(the same deal, announcement, earnings/deliveries print, report, or lawsuit — even if "
    "worded differently, from different outlets, or tagged to different tickers) share ONE "
    "group number. Genuinely different events get different numbers. Return one entry per "
    "item with the same n. JSON only."
)


def merge_events(events: list[dict], cfg: dict, secrets: dict):
    """Second pass: semantically group already-clustered events so differently-worded
    headlines of the SAME event collapse to one. Returns (merged_events, usage).
    Falls back to the input unchanged on any failure."""
    usage = {"prompt_tokens": 0, "completion_tokens": 0}
    if len(events) <= 1:
        return events, usage

    lines = []
    for i, it in enumerate(events, 1):
        v = it.get("verdict") or {}
        lines.append(f"{i}) {','.join(it['tickers'])} | {it['title']} [{v.get('event', '')}]")
    user = "Group these:\n" + "\n".join(lines)
    try:
        parsed, u = _llm_json(cfg, secrets, _MERGE_SYSTEM, user, _MERGE_SCHEMA, "eventgroups")
    except Exception as e:  # noqa: BLE001
        print(f"[merge] failed, keeping unmerged: {e!r}")
        return events, usage
    usage["prompt_tokens"] += u.get("prompt_tokens", 0)
    usage["completion_tokens"] += u.get("completion_tokens", 0)

    by_n = {x["n"]: x["group"] for x in parsed.get("items", [])}
    groups: dict[int, list[dict]] = {}
    for i, it in enumerate(events, 1):
        g = by_n.get(i, -i)  # ungrouped -> unique singleton
        groups.setdefault(g, []).append(it)
    out = []
    for g in groups.values():
        g.sort(key=lambda it: (it["verdict"]["materiality"], it.get("dup_count", 1)), reverse=True)
        rep = dict(g[0])
        rep["tickers"] = sorted({t for it in g for t in it["tickers"]})
        rep["dup_count"] = sum(it.get("dup_count", 1) for it in g)
        out.append(rep)
    return out, usage
