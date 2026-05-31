"""Shared-password auth for the tablet SPAs (reception + door scanner).

This replaces the per-staff magic-link flow for the tablet use case. The model
is intentionally trivial:

  - admin sets ONE password per role in Settings
  - tablet POSTs it to /reception/login or /scanner/login → receives the hash
    as a long-lived "token" (just sha256 of the password + per-deploy salt)
  - tablet stores the token in localStorage and sends it as
    X-Reception-Token / X-Scanner-Token on every request
  - server re-derives the expected token from the stored hash and compares

When admin changes the password, the hash changes → all old tokens stop
matching → tablets see 401 and re-prompt for the new password.

This is appropriate for: trusted physical devices on a small team, where the
overhead of per-staff sessions outweighs the benefit. It is NOT appropriate
for any flow that requires per-user audit trail (use magic-link for those).
"""
import hashlib
import os
from typing import Optional

from fastapi import Header, HTTPException, Depends
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.services.steam_settings import get_or_create_settings


# Per-deploy salt — keeps hashes from being usable across environments even
# if a password leaks. Default is fine; production may override via env.
_SALT = (os.getenv("ATMOS_ROLE_PASSWORD_SALT") or "atmos-steam-static-salt").strip()


def hash_password(plaintext: str) -> str:
    """Server-side hash. sha256 is fine here — the threat model is replay of
    leaked tablet tokens, not offline dictionary attack on a stolen DB dump
    (because the password is admin-set, length-controlled, single-purpose)."""
    h = hashlib.sha256()
    h.update(_SALT.encode("utf-8"))
    h.update(b"\x00")
    h.update(plaintext.encode("utf-8"))
    return h.hexdigest()


def _check(token: Optional[str], expected_hash: Optional[str], role_label: str) -> None:
    if not expected_hash:
        raise HTTPException(
            status_code=503,
            detail={
                "error": "role_password_not_set",
                "message": f"{role_label} password is not configured. Ask the manager to set it in admin → Settings.",
                "role": role_label,
            },
        )
    if not token or token != expected_hash:
        raise HTTPException(
            status_code=401,
            detail={
                "error": "invalid_or_expired",
                "message": "Please re-enter the password.",
                "role": role_label,
            },
        )


def require_reception_password(
    x_reception_token: Optional[str] = Header(default=None, alias="X-Reception-Token"),
    db: Session = Depends(get_db),
) -> None:
    s = get_or_create_settings(db)
    _check(x_reception_token, s.reception_password_hash, "reception")


def require_scanner_password(
    x_scanner_token: Optional[str] = Header(default=None, alias="X-Scanner-Token"),
    db: Session = Depends(get_db),
) -> None:
    s = get_or_create_settings(db)
    _check(x_scanner_token, s.scanner_password_hash, "scanner")
