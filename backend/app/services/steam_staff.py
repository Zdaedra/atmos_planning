"""Staff (door scanner) lifecycle.

The manager creates a SteamStaff row → server returns a one-time activation URL
(/steam/staff/activate/{activation_token}). The host taps it on the phone they'll use
at the entrance → activation_token is consumed and a session_token (24h TTL) is set.
That session_token sits in localStorage on the host's phone and is sent back as
`X-Staff-Token` on every QR-verify call.

We don't pretend this is a real auth system: it's a known-shared-secret model that
fits a one-day festival door. Refresh by reissuing the activation link.
"""
import secrets
from dataclasses import dataclass
from datetime import datetime, timedelta
from typing import Optional
from uuid import UUID

from fastapi import Depends, Header, HTTPException
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.time_utils import BALI_TZ
from app.models.steam import SteamStaff


@dataclass(frozen=True)
class StaffPrincipal:
    """Detached, plain-Python view of a SteamStaff row — safe to pass between FastAPI
    dependencies without DetachedInstanceError on attribute access."""
    id: UUID
    name: str
    status: str

_SESSION_TTL = timedelta(hours=24)


def _now() -> datetime:
    return datetime.now(BALI_TZ)


def _new_token() -> str:
    """URL-safe ~43 chars; cryptographically random."""
    return secrets.token_urlsafe(32)


def create_staff(db: Session, name: str) -> SteamStaff:
    """Insert a new staff row + initial activation_token. Caller commits."""
    row = SteamStaff(name=name.strip(), activation_token=_new_token(), status="active")
    db.add(row)
    db.flush()
    return row


def reissue_activation(db: Session, staff_id: UUID) -> SteamStaff:
    row = db.query(SteamStaff).filter(SteamStaff.id == staff_id).first()
    if not row:
        raise HTTPException(status_code=404, detail={"error": "not_found"})
    row.activation_token = _new_token()
    row.session_token = None
    row.session_expires_at = None
    db.flush()
    return row


def deactivate(db: Session, staff_id: UUID) -> SteamStaff:
    row = db.query(SteamStaff).filter(SteamStaff.id == staff_id).first()
    if not row:
        raise HTTPException(status_code=404, detail={"error": "not_found"})
    row.status = "inactive"
    row.activation_token = None
    row.session_token = None
    row.session_expires_at = None
    db.flush()
    return row


def activate(db: Session, activation_token: str) -> SteamStaff:
    """Consume the one-time activation_token, mint a 24h session_token."""
    row = (
        db.query(SteamStaff)
        .filter(SteamStaff.activation_token == activation_token)
        .with_for_update()
        .first()
    )
    if not row or row.status != "active":
        raise HTTPException(status_code=404, detail={"error": "not_found"})
    row.activation_token = None  # one-shot
    row.session_token = _new_token()
    row.session_expires_at = _now() + _SESSION_TTL
    row.last_seen_at = _now()
    db.commit()
    db.refresh(row)
    return row


def authenticate(db: Session, session_token: str) -> Optional[SteamStaff]:
    """Look up a staff row by session_token. Returns the attached row or None.
    We deliberately do NOT commit / refresh last_seen_at here — committing inside a
    FastAPI dependency expires attributes on the returned row, leading to a
    DetachedInstanceError when downstream endpoints touch `staff.id`. last_seen_at
    is updated by the verify endpoint after a successful scan, which is a better
    semantic anyway."""
    if not session_token:
        return None
    row = db.query(SteamStaff).filter(SteamStaff.session_token == session_token).first()
    if not row or row.status != "active":
        return None
    if not row.session_expires_at or row.session_expires_at < _now():
        return None
    return row


def cleanup_expired_sessions(db: Session) -> dict:
    """Hourly tick: clear session_token / session_expires_at for any staff whose
    24h window passed. Doesn't touch activation_token — that's a separate lifecycle."""
    now = _now()
    rows = (
        db.query(SteamStaff)
        .filter(
            SteamStaff.session_token.isnot(None),
            SteamStaff.session_expires_at < now,
        )
        .with_for_update(skip_locked=True)
        .all()
    )
    for r in rows:
        r.session_token = None
        r.session_expires_at = None
    db.commit()
    return {"cleared": len(rows)}


# ---------------------------------------------------------------------------
# FastAPI dependency
# ---------------------------------------------------------------------------

def require_staff(
    x_staff_token: Optional[str] = Header(default=None),
    db: Session = Depends(get_db),
) -> StaffPrincipal:
    """Use as `Depends(steam_staff.require_staff)` to gate scanner endpoints. Reads
    X-Staff-Token header, authenticates against steam_staff, returns a plain-Python
    StaffPrincipal (NOT the ORM row) so downstream endpoints can read .id/.name
    safely even if the session has expired attributes on the original row."""
    if not x_staff_token:
        raise HTTPException(status_code=401, detail={"error": "missing_staff_token"})
    row = authenticate(db, x_staff_token)
    if not row:
        raise HTTPException(status_code=401, detail={"error": "invalid_or_expired_staff_token"})
    return StaffPrincipal(id=row.id, name=row.name, status=row.status)
