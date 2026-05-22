"""Append-only event log for steam analytics. Each meaningful action (guest, staff,
admin, system) writes one row. Reads happen only from a future analytics dashboard.

Keep callers cheap: never raise on logging failure — analytics must not break product.
"""
import logging
from typing import Any, Optional
from uuid import UUID

from sqlalchemy.orm import Session

from app.models.steam import SteamEvent

logger = logging.getLogger(__name__)


def log_event(
    db: Session,
    event_type: str,
    *,
    properties: Optional[dict[str, Any]] = None,
    booking_id: Optional[UUID] = None,
    slot_id: Optional[UUID] = None,
    staff_id: Optional[UUID] = None,
    device_fingerprint: Optional[str] = None,
    ip: Optional[str] = None,
    user_agent: Optional[str] = None,
) -> None:
    """Insert one event row. Caller commits. Errors are swallowed (log to stdout) —
    we never want analytics to abort a booking transaction."""
    try:
        db.add(
            SteamEvent(
                event_type=event_type,
                properties=properties or {},
                booking_id=booking_id,
                slot_id=slot_id,
                staff_id=staff_id,
                device_fingerprint=device_fingerprint,
                ip=ip,
                user_agent=user_agent,
            )
        )
    except Exception:
        # Visible in docker logs; previous print() worked but is harder to grep/route.
        logger.warning("steam_events failed to log %r", event_type, exc_info=True)
