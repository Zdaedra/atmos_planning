"""Booking identifiers.

- code: `ATM-XXXXX` — short, human-readable, used as fallback when QR scan fails.
  5 chars from a no-confusion alphabet (drops 0/O/I/L/1). 28^5 ≈ 17M values;
  with collision-retry loop we accept tiny re-try cost.
- qr_token / cancel_token: opaque uuid4 — what we put in the QR and email link.
"""
import secrets
from uuid import UUID, uuid4

from sqlalchemy.orm import Session

# 28 chars: a-z + 2-9, minus the confusable set
_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789"
_CODE_LEN = 5


def _random_code() -> str:
    return "ATM-" + "".join(secrets.choice(_ALPHABET) for _ in range(_CODE_LEN))


def gen_unique_code(db: Session, max_attempts: int = 20) -> str:
    """Generate a code that doesn't collide with any existing steam_bookings.code.
    Caller passes the same db session it's about to INSERT in — so the check sees
    rows from the same transaction (important when we issue several codes for a
    multi-slot booking)."""
    from app.models.steam import SteamBooking  # local import to avoid cycles

    for _ in range(max_attempts):
        candidate = _random_code()
        exists = (
            db.query(SteamBooking.id)
            .filter(SteamBooking.code == candidate)
            .first()
            is not None
        )
        if not exists:
            return candidate
    # 28^5 ≈ 17M; after 20 random hits we're either out of luck (astronomically
    # unlikely) or out of code space — raise so the caller can decide.
    raise RuntimeError("Could not generate unique booking code after 20 attempts")


def gen_qr_token() -> UUID:
    return uuid4()


def gen_cancel_token() -> UUID:
    return uuid4()
