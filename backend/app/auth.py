"""Parent gate: 4-digit PIN -> short-lived signed token sent as X-Parent-Token."""
from __future__ import annotations

import hashlib
import hmac
import time

from fastapi import Depends, Header, HTTPException
from sqlmodel import Session

from .config import settings
from .db import get_session, get_setting, set_setting

TOKEN_TTL = 2 * 60 * 60


def _hash_pin(pin: str) -> str:
    return hashlib.pbkdf2_hmac("sha256", pin.encode(), settings.secret_key.encode(), 100_000).hex()


def check_pin(s: Session, pin: str) -> bool:
    stored = get_setting(s, "pin_hash")
    if not stored:
        return hmac.compare_digest(pin, settings.default_pin)
    return hmac.compare_digest(_hash_pin(pin), stored)


def set_pin(s: Session, pin: str) -> None:
    set_setting(s, "pin_hash", _hash_pin(pin))


def make_token() -> str:
    exp = str(int(time.time()) + TOKEN_TTL)
    sig = hmac.new(settings.secret_key.encode(), exp.encode(), hashlib.sha256).hexdigest()
    return f"{exp}.{sig}"


def valid_token(token: str | None) -> bool:
    if not token or "." not in token:
        return False
    exp, sig = token.split(".", 1)
    good = hmac.new(settings.secret_key.encode(), exp.encode(), hashlib.sha256).hexdigest()
    return hmac.compare_digest(sig, good) and exp.isdigit() and int(exp) > time.time()


def require_parent(x_parent_token: str | None = Header(default=None), s: Session = Depends(get_session)) -> bool:
    if not valid_token(x_parent_token):
        raise HTTPException(status_code=401, detail="Parent gate required")
    return True
