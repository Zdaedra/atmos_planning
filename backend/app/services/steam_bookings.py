"""Booking transactions: atomic create, cancel, expire.

The hot path here is `create_bookings`. The key guarantee — no double-booking under
concurrent POSTs — comes from a single transaction that:
  1. SELECT … FOR UPDATE on every requested slot row
  2. SELECT COUNT(*) FOR UPDATE on the guest's active bookings (limit check)
  3. INSERT booking rows + UPDATE booked_count
  4. COMMIT

Phase-2 lifecycle note: bookings are created with status='confirmed' immediately when
`steam_settings.resend_from_email` is unset (no email channel wired). When that field
is populated (Phase 3 onward), this function will create them as 'pending' and the
delivery webhook flips them to 'confirmed'. The decision is per-request, so there is
no migration step: the moment a manager fills in the Resend address, the next booking
will follow the email-gated path.
"""
from datetime import datetime, timedelta
from typing import Optional
from uuid import UUID

from fastapi import HTTPException
from sqlalchemy import func, or_
from sqlalchemy.orm import Session

from app.core.time_utils import BALI_TZ
from app.models.steam import SteamBooking, SteamSlot
from app.services import steam_cache, steam_email, steam_events
from app.services.steam_settings import get_or_create_settings
from app.services.steam_tokens import gen_cancel_token, gen_qr_token, gen_unique_code


_ACTIVE_STATUSES = ("pending", "confirmed", "used")


def _limit_for(settings, service_type: str) -> int:
    """Per-service limit lookup. New service types added later will need a row here
    (and the matching column in steam_settings)."""
    if service_type == "steam":
        return settings.max_bookings_per_guest
    if service_type == "massage":
        return settings.max_massage_bookings_per_guest
    raise HTTPException(status_code=500, detail={"error": "unknown_service_type", "service_type": service_type})


def _now() -> datetime:
    return datetime.now(BALI_TZ)


def create_bookings(
    db: Session,
    slot_ids: list[UUID],
    email: str,
    name: Optional[str],
    device_fingerprint: Optional[str],
    ip: Optional[str],
    user_agent: Optional[str],
) -> list[SteamBooking]:
    """One row per slot_id. All-or-nothing — any failure aborts the whole transaction
    and capacity stays untouched. Caller does NOT commit; we commit inside so the
    FOR UPDATE lock actually releases."""
    if not slot_ids:
        raise HTTPException(status_code=400, detail={"error": "no_slots"})
    if len(slot_ids) != len(set(slot_ids)):
        raise HTTPException(status_code=400, detail={"error": "duplicate_slot_ids"})

    settings = get_or_create_settings(db)
    email_norm = email.strip().lower()
    now = _now()
    in_email_mode = bool((settings.resend_from_email or "").strip())
    initial_status = "pending" if in_email_mode else "confirmed"

    # 1. Lock all slots in one statement (lock order = id-sorted to avoid deadlocks
    #    across concurrent multi-slot bookings).
    slot_ids_sorted = sorted(slot_ids, key=str)
    slots = (
        db.query(SteamSlot)
        .filter(SteamSlot.id.in_(slot_ids_sorted))
        .order_by(SteamSlot.id)
        .with_for_update()
        .all()
    )
    found = {s.id for s in slots}
    missing = [sid for sid in slot_ids_sorted if sid not in found]
    if missing:
        raise HTTPException(status_code=404, detail={"error": "slot_not_found", "ids": [str(m) for m in missing]})

    # 2. Validate each slot
    for s in slots:
        if s.status != "open":
            raise HTTPException(status_code=409, detail={"error": "slot_closed", "slot_id": str(s.id)})
        if s.starts_at <= now:
            raise HTTPException(status_code=409, detail={"error": "slot_past", "slot_id": str(s.id)})
        if s.booked_count + 1 > s.capacity:
            raise HTTPException(status_code=409, detail={"error": "slot_full", "slot_id": str(s.id)})

    # 3. Per-guest limit check — separately per service_type. A guest may book up to
    #    `max_bookings_per_guest` steam sessions AND `max_massage_bookings_per_guest`
    #    massages simultaneously; the two limits don't sum into one.
    #    Postgres rejects COUNT(*) ... FOR UPDATE — we lock rows and count Python-side.
    identity_conditions = [func.lower(SteamBooking.guest_email) == email_norm]
    if device_fingerprint:
        identity_conditions.append(SteamBooking.device_fingerprint == device_fingerprint)
    active_rows = (
        db.query(SteamBooking.id, SteamBooking.service_type)
        .filter(
            SteamBooking.status.in_(_ACTIVE_STATUSES),
            or_(*identity_conditions),
        )
        .with_for_update()
        .all()
    )
    existing_by_service: dict[str, int] = {}
    for _id, svc in active_rows:
        existing_by_service[svc] = existing_by_service.get(svc, 0) + 1

    requested_by_service: dict[str, int] = {}
    for s in slots:
        requested_by_service[s.service_type] = requested_by_service.get(s.service_type, 0) + 1

    for svc, requested in requested_by_service.items():
        existing = existing_by_service.get(svc, 0)
        limit = _limit_for(settings, svc)
        if existing + requested > limit:
            steam_events.log_event(
                db,
                "booking_failed",
                properties={
                    "reason": "limit_exceeded",
                    "service_type": svc,
                    "existing": existing,
                    "requested": requested,
                    "limit": limit,
                },
                device_fingerprint=device_fingerprint,
                ip=ip,
                user_agent=user_agent,
            )
            db.commit()
            raise HTTPException(
                status_code=409,
                detail={
                    "error": "limit_exceeded",
                    "service_type": svc,
                    "limit": limit,
                    "existing": existing,
                },
            )

    # 4. Insert rows + bump counters.
    bookings: list[SteamBooking] = []
    confirmed_at = now if initial_status == "confirmed" else None
    for s in slots:
        booking = SteamBooking(
            code=gen_unique_code(db),
            service_type=s.service_type,
            slot_id=s.id,
            guest_email=email_norm,
            guest_name=(name or None),
            device_fingerprint=device_fingerprint,
            status=initial_status,
            qr_token=gen_qr_token(),
            cancel_token=gen_cancel_token(),
            ip=ip,
            user_agent=user_agent,
            confirmed_at=confirmed_at,
        )
        db.add(booking)
        s.booked_count = s.booked_count + 1
        bookings.append(booking)

    db.flush()  # populate booking.id for event log

    for b in bookings:
        steam_events.log_event(
            db,
            "booking_created",
            properties={"status": b.status, "mode": "email" if in_email_mode else "instant"},
            booking_id=b.id,
            slot_id=b.slot_id,
            device_fingerprint=device_fingerprint,
            ip=ip,
            user_agent=user_agent,
        )

    db.commit()
    for b in bookings:
        db.refresh(b)
    steam_cache.invalidate()
    return bookings


def cancel_by_token(
    db: Session,
    cancel_token: UUID,
    *,
    actor: str = "guest",
    ip: Optional[str] = None,
    user_agent: Optional[str] = None,
) -> SteamBooking:
    """Public cancel-by-link. Returns the cancelled booking (idempotent on already-cancelled).
    `actor` distinguishes guest cancel vs admin cancel for the event log."""
    booking = (
        db.query(SteamBooking)
        .filter(SteamBooking.cancel_token == cancel_token)
        .with_for_update()
        .first()
    )
    if not booking:
        raise HTTPException(status_code=404, detail={"error": "not_found"})

    if booking.status == "cancelled":
        return booking  # idempotent
    if booking.status in ("expired", "used"):
        raise HTTPException(
            status_code=409,
            detail={"error": "cannot_cancel", "status": booking.status},
        )

    # active → cancelled. Release capacity.
    was_active = booking.status in _ACTIVE_STATUSES
    booking.status = "cancelled"
    booking.cancelled_at = _now()

    if was_active:
        slot = (
            db.query(SteamSlot)
            .filter(SteamSlot.id == booking.slot_id)
            .with_for_update()
            .first()
        )
        if slot and slot.booked_count > 0:
            slot.booked_count = slot.booked_count - 1

    steam_events.log_event(
        db,
        "booking_cancelled_by_admin" if actor == "admin" else "booking_cancelled_by_guest",
        properties={"code": booking.code},
        booking_id=booking.id,
        slot_id=booking.slot_id,
        ip=ip,
        user_agent=user_agent,
    )
    db.commit()
    db.refresh(booking)
    steam_cache.invalidate()
    return booking


def cancel_by_id(
    db: Session,
    booking_id: UUID,
    *,
    actor: str = "admin",
) -> SteamBooking:
    """Admin cancel — looks up booking by id, then funnels through cancel_by_token semantics."""
    booking = db.query(SteamBooking).filter(SteamBooking.id == booking_id).first()
    if not booking:
        raise HTTPException(status_code=404, detail={"error": "not_found"})
    return cancel_by_token(db, booking.cancel_token, actor=actor)


def webhook_resend_event(
    db: Session,
    *,
    event_type: str,
    to_email: str,
) -> dict:
    """Apply a Resend delivery-status event to this guest's pending bookings.

    We deliberately resolve by recipient email rather than by Resend message_id —
    avoids tracking that id per booking row, and `delivered/bounced` for an address
    realistically applies to every pending row for that address anyway.
      email.delivered  → pending → confirmed (clears the email-window timer)
      email.bounced    → pending → expired + release capacity
      email.complained → pending → expired + release capacity
    """
    email_norm = (to_email or "").strip().lower()
    if not email_norm:
        return {"updated": 0, "ignored": True}

    target_status = None
    if event_type == "email.delivered":
        target_status = "confirmed"
    elif event_type in ("email.bounced", "email.complained"):
        target_status = "expired"
    else:
        return {"updated": 0, "ignored": True, "reason": "unhandled_event"}

    rows = (
        db.query(SteamBooking)
        .filter(
            SteamBooking.guest_email == email_norm,
            SteamBooking.status == "pending",
        )
        .with_for_update()
        .all()
    )
    if not rows:
        return {"updated": 0}

    now = _now()
    release_capacity = target_status == "expired"
    slots_to_release: dict = {}
    for b in rows:
        b.status = target_status
        if target_status == "confirmed":
            b.confirmed_at = now
        if release_capacity:
            slots_to_release[b.slot_id] = slots_to_release.get(b.slot_id, 0) + 1
        steam_events.log_event(
            db,
            event_type.replace(".", "_"),  # email_delivered / email_bounced / email_complained
            properties={"booking_code": b.code},
            booking_id=b.id,
            slot_id=b.slot_id,
        )

    for slot_id, n in slots_to_release.items():
        slot = (
            db.query(SteamSlot).filter(SteamSlot.id == slot_id).with_for_update().first()
        )
        if slot and slot.booked_count >= n:
            slot.booked_count = slot.booked_count - n

    db.commit()
    if rows:
        steam_cache.invalidate()
    return {"updated": len(rows), "target_status": target_status}


def verify_qr(db: Session, qr_token: UUID, *, staff_id: Optional[UUID] = None) -> dict:
    """Door-side QR check. Returns a dict matching StaffVerifyResponse fields.

    Window rule: entry allowed iff now ∈ [starts_at - qr_valid_before_slot_minutes,
    starts_at]. After starts_at the booking is too_late even if still 'confirmed'.
    """
    settings = get_or_create_settings(db)
    booking = (
        db.query(SteamBooking)
        .filter(SteamBooking.qr_token == qr_token)
        .with_for_update()
        .first()
    )
    if not booking:
        steam_events.log_event(
            db,
            "qr_scan_rejected",
            properties={"reason": "not_found"},
            staff_id=staff_id,
        )
        db.commit()
        return {"result": "not_found"}

    base = {
        "code": booking.code,
        "service_type": booking.service_type,
        "guest_email": booking.guest_email,
    }
    slot = db.query(SteamSlot).filter(SteamSlot.id == booking.slot_id).first()
    if slot:
        base.update(
            {
                "slot_starts_at": slot.starts_at,
                "slot_ends_at": slot.ends_at,
                "therapist": slot.therapist,
                "room": slot.room,
                "variant": slot.variant,
            }
        )

    if booking.status == "cancelled":
        steam_events.log_event(
            db, "qr_scan_rejected",
            properties={"reason": "cancelled", "code": booking.code},
            booking_id=booking.id, slot_id=booking.slot_id, staff_id=staff_id,
        )
        db.commit()
        return {"result": "cancelled", **base}

    if booking.status == "expired":
        steam_events.log_event(
            db, "qr_scan_rejected",
            properties={"reason": "expired", "code": booking.code},
            booking_id=booking.id, slot_id=booking.slot_id, staff_id=staff_id,
        )
        db.commit()
        return {"result": "expired", **base}

    if booking.status == "used":
        steam_events.log_event(
            db, "qr_scan_rejected",
            properties={"reason": "already_used", "code": booking.code},
            booking_id=booking.id, slot_id=booking.slot_id, staff_id=staff_id,
        )
        db.commit()
        return {"result": "already_used", "entered_at": booking.entered_at, **base}

    # status ∈ {pending, confirmed} — gate by window
    now = _now()
    if not slot:
        # data integrity issue — treat as not_found
        db.commit()
        return {"result": "not_found"}

    entry_opens = slot.starts_at - timedelta(minutes=settings.qr_valid_before_slot_minutes)
    if now > slot.starts_at:
        steam_events.log_event(
            db, "qr_scan_rejected",
            properties={"reason": "too_late", "code": booking.code},
            booking_id=booking.id, slot_id=booking.slot_id, staff_id=staff_id,
        )
        db.commit()
        return {"result": "wrong_time", "reason": "too_late", **base}
    if now < entry_opens:
        steam_events.log_event(
            db, "qr_scan_rejected",
            properties={"reason": "too_early", "code": booking.code},
            booking_id=booking.id, slot_id=booking.slot_id, staff_id=staff_id,
        )
        db.commit()
        return {
            "result": "wrong_time",
            "reason": "too_early",
            "entry_opens_at": entry_opens,
            **base,
        }

    # All clear — promote to 'used'.
    booking.status = "used"
    booking.entered_at = now
    if booking.confirmed_at is None:
        booking.confirmed_at = now  # in case it was still pending (rare race)
    steam_events.log_event(
        db, "qr_scan_success",
        properties={"code": booking.code},
        booking_id=booking.id, slot_id=booking.slot_id, staff_id=staff_id,
    )
    db.commit()
    return {"result": "valid", "entered_at": booking.entered_at, **base}


def expire_overdue(db: Session) -> dict:
    """Move bookings past their natural end into 'expired'. Called by ai_monitor tick.

    Two rules:
      pending   → expired when created_at + booking_window_minutes < now (email never delivered)
      confirmed → expired when slot.starts_at < now (no-show)

    Capacity is intentionally NOT released on expiry — it's the spec'd policy
    ("no-show doesn't free the spot"). The slot's booked_count stays.
    """
    settings = get_or_create_settings(db)
    now = _now()
    window_cutoff = now - timedelta(minutes=settings.booking_window_minutes)

    # 1. Pending stragglers
    pending_q = (
        db.query(SteamBooking)
        .filter(
            SteamBooking.status == "pending",
            SteamBooking.created_at < window_cutoff,
        )
        .with_for_update(skip_locked=True)
    )
    pending_rows = pending_q.all()
    for b in pending_rows:
        b.status = "expired"
        steam_events.log_event(
            db,
            "booking_failed",
            properties={"reason": "pending_timeout", "code": b.code},
            booking_id=b.id,
            slot_id=b.slot_id,
        )

    # 2. Confirmed no-shows
    # join steam_slots to find ones whose start has passed
    confirmed_rows = (
        db.query(SteamBooking)
        .join(SteamSlot, SteamSlot.id == SteamBooking.slot_id)
        .filter(
            SteamBooking.status == "confirmed",
            SteamSlot.starts_at < now,
        )
        .with_for_update(skip_locked=True, of=SteamBooking)
        .all()
    )
    for b in confirmed_rows:
        b.status = "expired"
        steam_events.log_event(
            db,
            "booking_failed",
            properties={"reason": "no_show", "code": b.code},
            booking_id=b.id,
            slot_id=b.slot_id,
        )

    # Record the run — used by admin "last cron tick" chip. We log every tick
    # (even no-ops) so the chip can show a freshness signal.
    steam_events.log_event(
        db,
        "expire_run",
        properties={
            "pending_expired": len(pending_rows),
            "confirmed_expired": len(confirmed_rows),
        },
    )
    db.commit()
    if pending_rows or confirmed_rows:
        steam_cache.invalidate()
    return {
        "pending_expired": len(pending_rows),
        "confirmed_expired": len(confirmed_rows),
    }
