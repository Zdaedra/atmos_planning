"""Per-date overrides of the per-guest booking limit.

One row per Bali-local date. A NULL column means "fall back to the global
default in steam_settings for that service". A missing row means "no override
for that date" (i.e., the row only gets inserted when someone actually
deviates from defaults).
"""
from datetime import date
from typing import Optional

from sqlalchemy.orm import Session

from app.models.steam import SteamDayOverride


def get(db: Session, day: date) -> Optional[SteamDayOverride]:
    return db.query(SteamDayOverride).filter(SteamDayOverride.day == day).first()


def get_many(db: Session, days: list[date]) -> dict[date, SteamDayOverride]:
    """Bulk fetch — used by the booking transaction so we don't issue one query
    per slot day."""
    if not days:
        return {}
    rows = db.query(SteamDayOverride).filter(SteamDayOverride.day.in_(days)).all()
    return {r.day: r for r in rows}


def upsert(
    db: Session,
    day: date,
    *,
    max_steam_per_guest: Optional[int],
    max_massage_per_guest: Optional[int],
    note: Optional[str],
) -> SteamDayOverride:
    """Insert or update the row for `day`. If both limits are None AND note
    is None, the row is *deleted* instead — keeps the table sparse."""
    row = get(db, day)
    if max_steam_per_guest is None and max_massage_per_guest is None and not (note or "").strip():
        if row:
            db.delete(row)
            db.flush()
        # Return a synthetic empty-shape — caller is allowed to read .day/.max_*.
        return SteamDayOverride(day=day)
    if row is None:
        row = SteamDayOverride(day=day)
        db.add(row)
    row.max_steam_per_guest = max_steam_per_guest
    row.max_massage_per_guest = max_massage_per_guest
    row.note = (note or None) if isinstance(note, str) else note
    db.flush()
    return row


def delete(db: Session, day: date) -> bool:
    row = get(db, day)
    if not row:
        return False
    db.delete(row)
    db.flush()
    return True


def effective_limit(
    override: Optional[SteamDayOverride],
    service_type: str,
    default_steam: int,
    default_massage: int,
) -> int:
    """Resolve the limit for one (day, service) given an optional override row."""
    if override is not None:
        if service_type == "steam" and override.max_steam_per_guest is not None:
            return override.max_steam_per_guest
        if service_type == "massage" and override.max_massage_per_guest is not None:
            return override.max_massage_per_guest
    return default_steam if service_type == "steam" else default_massage
