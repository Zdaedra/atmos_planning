"""Materialization: turn a SteamSlotTemplate (a recurring rule) into concrete
SteamSlot rows on the horizon ahead. Idempotent — re-running on the same horizon
is a no-op (skipped count goes up but nothing is duplicated).

Pure function (`materialize_template`) plus a `materialize_all_active` convenience
that loops over active templates. Callers own the db.commit().
"""
from datetime import date, datetime, time, timedelta
from typing import Optional
from uuid import UUID

from sqlalchemy import func
from sqlalchemy.orm import Session

from app.core.time_utils import BALI_TZ
from app.models.steam import SteamSlot, SteamSlotTemplate
from app.services.steam_settings import get_or_create_settings


def _expected_dates(template: SteamSlotTemplate, horizon_end: date, today: date) -> list[date]:
    """All dates in [max(starts_on, today), min(horizon_end, repeats_until or horizon_end)]
    whose ISO weekday is in template.days_of_week. Inclusive on both ends.
    """
    window_start = max(template.starts_on, today)
    window_end = horizon_end
    if template.repeats_until is not None and template.repeats_until < window_end:
        window_end = template.repeats_until
    if window_start > window_end:
        return []

    days_set = set(template.days_of_week or [])
    out: list[date] = []
    d = window_start
    while d <= window_end:
        if d.isoweekday() in days_set:
            out.append(d)
        d += timedelta(days=1)
    return out


def _existing_dates_for_template(db: Session, template_id: UUID) -> set[date]:
    """Returns set of dates (in BALI_TZ) for which a slot with this template_id already
    exists — regardless of override or closed status. Those dates must NOT be re-created.
    """
    rows = (
        db.query(SteamSlot.starts_at)
        .filter(SteamSlot.template_id == template_id)
        .all()
    )
    out: set[date] = set()
    for (starts_at,) in rows:
        out.add(starts_at.astimezone(BALI_TZ).date())
    return out


def materialize_template(
    db: Session,
    template: SteamSlotTemplate,
    horizon_end: date,
    today: Optional[date] = None,
) -> dict:
    """Materialize one template up to `horizon_end` inclusive. Caller commits."""
    if today is None:
        today = datetime.now(BALI_TZ).date()

    result = {"created": 0, "skipped": 0, "paused": False}

    # Expired template — auto-pause and bail
    if template.repeats_until is not None and template.repeats_until < today:
        if template.status != "paused":
            template.status = "paused"
            result["paused"] = True
        return result

    if template.status != "active":
        return result

    expected = _expected_dates(template, horizon_end, today)
    if not expected:
        return result

    existing = _existing_dates_for_template(db, template.id)

    for slot_date in expected:
        if slot_date in existing:
            result["skipped"] += 1
            continue
        starts_dt = datetime.combine(slot_date, template.start_time, tzinfo=BALI_TZ)
        ends_dt = starts_dt + timedelta(minutes=template.duration_minutes)
        db.add(
            SteamSlot(
                service_type=template.service_type,
                starts_at=starts_dt,
                ends_at=ends_dt,
                capacity=template.capacity,
                booked_count=0,
                template_id=template.id,
                is_override=False,
                status="open",
                therapist=template.therapist,
                room=template.room,
                variant=template.variant,
            )
        )
        result["created"] += 1

    return result


def materialize_all_active(db: Session, horizon_end: Optional[date] = None) -> dict:
    """Iterate over every template (active or paused-but-not-yet-marked) and materialize.
    Used by the daily cron tick. Caller commits.
    """
    if horizon_end is None:
        settings = get_or_create_settings(db)
        today = datetime.now(BALI_TZ).date()
        horizon_end = today + timedelta(weeks=settings.materialization_horizon_weeks)

    totals = {"templates_processed": 0, "created": 0, "skipped": 0, "paused": 0}
    templates = db.query(SteamSlotTemplate).all()
    for tpl in templates:
        r = materialize_template(db, tpl, horizon_end)
        totals["templates_processed"] += 1
        totals["created"] += r["created"]
        totals["skipped"] += r["skipped"]
        if r["paused"]:
            totals["paused"] += 1
    # Record this run so the admin UI can show "Last materialized: X ago".
    from app.services import steam_events
    steam_events.log_event(db, "materialization_run", properties=totals)
    return totals


def preview_template_dates(
    days_of_week: list[int],
    starts_on: date,
    repeats_until: Optional[date],
    limit: int = 5,
    today: Optional[date] = None,
) -> list[date]:
    """Compute first `limit` dates a template with these params would materialize, starting
    from max(starts_on, today). No DB lookup — used by admin Preview button."""
    if today is None:
        today = datetime.now(BALI_TZ).date()
    days_set = set(days_of_week)
    window_start = max(starts_on, today)
    cap_end = repeats_until if repeats_until is not None else (window_start + timedelta(days=365 * 2))
    out: list[date] = []
    d = window_start
    while d <= cap_end and len(out) < limit:
        if d.isoweekday() in days_set:
            out.append(d)
        d += timedelta(days=1)
    return out


def propagate_template_to_unbooked_slots(db: Session, template: SteamSlotTemplate) -> int:
    """Apply current template fields to every future, unbooked, non-override, open slot
    derived from this template. Used when the manager edits a template — without this,
    a 19:00 → 20:00 change would silently leave already-materialized slots at 19:00
    (materialize_template skips dates that already exist).

    Returns count of rows updated. Caller commits."""
    now = datetime.now(BALI_TZ)
    rows = (
        db.query(SteamSlot)
        .filter(
            SteamSlot.template_id == template.id,
            SteamSlot.is_override.is_(False),
            SteamSlot.status == "open",
            SteamSlot.booked_count == 0,
            SteamSlot.starts_at > now,
        )
        .with_for_update()
        .all()
    )
    for s in rows:
        # The slot's date is preserved (it's the materialized day); only the wall-clock
        # time + duration + capacity + service-specific fields move.
        day = s.starts_at.astimezone(BALI_TZ).date()
        new_starts = datetime.combine(day, template.start_time, tzinfo=BALI_TZ)
        s.service_type = template.service_type
        s.starts_at = new_starts
        s.ends_at = new_starts + timedelta(minutes=template.duration_minutes)
        s.capacity = template.capacity
        s.therapist = template.therapist
        s.room = template.room
        s.variant = template.variant
    return len(rows)


def delete_unbooked_future_slots(db: Session, template_id: UUID) -> int:
    """When pausing a template: remove future slots that nobody booked and weren't manually
    edited. Returns count deleted. Caller commits.
    """
    now = datetime.now(BALI_TZ)
    q = (
        db.query(SteamSlot)
        .filter(
            SteamSlot.template_id == template_id,
            SteamSlot.starts_at > now,
            SteamSlot.booked_count == 0,
            SteamSlot.is_override.is_(False),
            SteamSlot.status == "open",
        )
    )
    rows = q.all()
    for r in rows:
        db.delete(r)
    return len(rows)
