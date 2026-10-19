"""All Claude API calls live here (backend only; the key never reaches the browser).

- Structured outputs (`output_config.format` json_schema) so every reply is valid JSON.
- Rate limits per minute/day and a hard monthly spending cap, checked before every call.
- Every call is logged with tokens and USD cost (ApiCall table).
- Sonnet/Opus calls opt into server-side refusal fallbacks ("fallbacks": "default").
"""
from __future__ import annotations

import json
import logging
from datetime import timedelta

import anthropic
from sqlmodel import Session, func, select

from .config import PRICING, settings
from .db import ApiCall, engine, get_setting, now

log = logging.getLogger("brickbuddy.claude")


class LimitReached(Exception):
    """Spending cap or rate limit hit. Message is parent-facing; kid UI shows the bunny."""


class GentleRedirect(Exception):
    """Claude declined; kid UI shows the gentle 'let's try again' avatar."""


_client: anthropic.Anthropic | None = None


def client() -> anthropic.Anthropic | None:
    global _client
    if not settings.anthropic_api_key:
        return None
    if _client is None:
        _client = anthropic.Anthropic(api_key=settings.anthropic_api_key, max_retries=2, timeout=120)
    return _client


def enabled() -> bool:
    return bool(settings.anthropic_api_key)


def cost_of(model: str, inp: int, out: int) -> float:
    pin, pout = PRICING.get(model, (4.0, 20.0))
    return inp / 1e6 * pin + out / 1e6 * pout


def month_spend(s: Session) -> float:
    start = now().replace(day=1, hour=0, minute=0, second=0, microsecond=0)
    return float(s.exec(select(func.coalesce(func.sum(ApiCall.cost_usd), 0.0)).where(ApiCall.created_at >= start)).one())


def check_limits(s: Session) -> None:
    cap = float(get_setting(s, "monthly_cap_usd") or 0)  # 0 = no Claude calls at all
    spent = month_spend(s)
    if spent >= cap:
        raise LimitReached(f"Monthly spending cap reached (${spent:.2f} of ${cap:.2f}).")
    per_min = int(get_setting(s, "calls_per_minute") or 0)
    per_day = int(get_setting(s, "calls_per_day") or 0)
    t = now()
    if per_min:
        n = s.exec(select(func.count()).select_from(ApiCall).where(ApiCall.created_at >= t - timedelta(minutes=1))).one()
        if n >= per_min:
            raise LimitReached("Too many builds this minute. Take a little break!")
    if per_day:
        n = s.exec(select(func.count()).select_from(ApiCall).where(ApiCall.created_at >= t - timedelta(days=1))).one()
        if n >= per_day:
            raise LimitReached("That's lots of building today! More tomorrow.")


EFFORT = {"claude-haiku-5-5": "low", "claude-sonnet-5-5": "medium", "claude-opus-5-5": "high"}


def call_json(*, purpose: str, model: str, system: str, messages: list, schema: dict, max_tokens: int = 16000):
    """Return (parsed_json, response_content, cost_usd). Appends nothing to `messages`."""
    c = client()
    if c is None:
        raise RuntimeError("ANTHROPIC_API_KEY is not set")
    with Session(engine) as s:
        check_limits(s)
    kwargs = dict(
        model=model,
        max_tokens=max_tokens,
        system=system,
        messages=messages,
        output_config={"effort": EFFORT.get(model, "medium"), "format": {"type": "json_schema", "schema": schema}},
    )
    try:
        if model.startswith(("claude-sonnet", "claude-opus")):
            resp = c.beta.messages.create(**kwargs, betas=["server-side-fallback-2026-07-01"], fallbacks="default")
        else:
            resp = c.messages.create(**kwargs)
    except anthropic.RateLimitError as exc:
        _log(model, purpose, 0, 0, ok=False)
        raise LimitReached("Claude is busy right now. Let's try again in a minute.") from exc
    except anthropic.APIStatusError as exc:
        _log(model, purpose, 0, 0, ok=False)
        raise RuntimeError(f"Claude API error {exc.status_code}: {exc.message}") from exc
    except anthropic.APIConnectionError as exc:
        raise RuntimeError("Could not reach Claude (check the internet connection).") from exc
    usage = resp.usage
    inp = (usage.input_tokens or 0) + (getattr(usage, "cache_creation_input_tokens", 0) or 0) + (getattr(usage, "cache_read_input_tokens", 0) or 0)
    out = usage.output_tokens or 0
    cost = cost_of(model, inp, out)
    _log(model, purpose, inp, out, cost=cost, ok=resp.stop_reason not in ("refusal",))
    if resp.stop_reason == "refusal":
        raise GentleRedirect("Let's build something else!")
    if resp.stop_reason == "max_tokens":
        raise RuntimeError("Claude's answer was too long; try a smaller idea.")
    text = next((b.text for b in resp.content if getattr(b, "type", "") == "text"), "")
    try:
        data = json.loads(text)
    except json.JSONDecodeError as exc:
        raise RuntimeError("Claude returned invalid JSON") from exc
    return data, resp.content, cost


def _log(model, purpose, inp, out, cost=0.0, ok=True):
    with Session(engine) as s:
        s.add(ApiCall(model=model, purpose=purpose, input_tokens=inp, output_tokens=out, cost_usd=cost, ok=ok))
        s.commit()
