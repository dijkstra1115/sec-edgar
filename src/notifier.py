"""
Pluggable notification sink for the insider-filing alert system.

Zero-token by design: a notifier just formats a string and does one HTTP POST.
There is NO LLM anywhere in this path. To support another channel (email, Discord,
ntfy, ...) add a Notifier subclass and register it in build_notifier().

Secrets are read from (priority order):
  1. environment variables  TELEGRAM_BOT_TOKEN / TELEGRAM_CHAT_ID
  2. config/secrets.local.json  ->  {"telegram": {"bot_token": "...", "chat_id": "..."}}
Never commit real secrets. Template: config/secrets.example.json.
"""
from __future__ import annotations

import json
import os
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SECRETS_FILE = ROOT / "config" / "secrets.local.json"


def _load_secrets() -> dict:
    if SECRETS_FILE.exists():
        try:
            return json.loads(SECRETS_FILE.read_text(encoding="utf-8"))
        except Exception:
            return {}
    return {}


class Notifier:
    """Base class. send() returns True on success."""

    def send(self, text: str) -> bool:
        raise NotImplementedError

    @property
    def configured(self) -> bool:
        return True


class ConsoleNotifier(Notifier):
    """Fallback / --dry-run sink: prints to stdout (with tags stripped-ish)."""

    def send(self, text: str) -> bool:
        print("\n" + "-" * 62)
        print(text.replace("<b>", "").replace("</b>", ""))
        print("-" * 62)
        return True


class TelegramNotifier(Notifier):
    """Delivers to a Telegram chat via the Bot API. One HTTP POST, free, instant."""

    def __init__(self) -> None:
        tg = _load_secrets().get("telegram", {})
        self.token = os.environ.get("TELEGRAM_BOT_TOKEN") or tg.get("bot_token", "")
        self.chat_id = os.environ.get("TELEGRAM_CHAT_ID") or tg.get("chat_id", "")

    @property
    def configured(self) -> bool:
        return bool(self.token and self.chat_id)

    def send(self, text: str) -> bool:
        if not self.configured:
            raise RuntimeError("Telegram not configured (missing bot_token/chat_id)")
        url = f"https://api.telegram.org/bot{self.token}/sendMessage"
        data = urllib.parse.urlencode({
            "chat_id": self.chat_id,
            "text": text,
            "parse_mode": "HTML",
            "disable_web_page_preview": "true",
        }).encode()
        req = urllib.request.Request(url, data=data)
        try:
            with urllib.request.urlopen(req, timeout=20) as resp:
                return bool(json.loads(resp.read()).get("ok"))
        except urllib.error.HTTPError as e:
            print(f"[notifier] Telegram HTTP {e.code}: {e.read().decode('utf-8', 'replace')}")
            return False
        except Exception as e:  # noqa: BLE001 - network layer, never crash the poller
            print(f"[notifier] Telegram error: {e!r}")
            return False

    def print_chat_ids(self) -> None:
        """Discover your chat_id: message the bot once, then run --get-chat-id."""
        if not self.token:
            print("Set TELEGRAM_BOT_TOKEN (or bot_token in secrets.local.json) first.")
            return
        url = f"https://api.telegram.org/bot{self.token}/getUpdates"
        with urllib.request.urlopen(url, timeout=20) as resp:
            body = json.loads(resp.read())
        seen = set()
        for u in body.get("result", []):
            msg = u.get("message") or u.get("channel_post") or {}
            chat = msg.get("chat", {})
            cid = chat.get("id")
            if cid is not None and cid not in seen:
                seen.add(cid)
                who = chat.get("title") or chat.get("username") or chat.get("first_name")
                print(f"chat_id={cid}  type={chat.get('type')}  name={who}")
        if not seen:
            print("No messages found. Send ANY message to your bot in Telegram first, then re-run.")


def build_notifier(name: str) -> Notifier:
    if name == "telegram":
        return TelegramNotifier()
    if name == "console":
        return ConsoleNotifier()
    raise ValueError(f"unknown notifier: {name!r}")
