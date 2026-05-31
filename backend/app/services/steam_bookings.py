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
from datetime import date, datetime, timedelta
from typing import Optional
from uuid import UUID

from fastapi import HTTPException
from sqlalchemy import func, or_
from sqlalchemy.orm import Session

from app.core.time_utils import BALI_TZ
from app.models.steam import SteamBooking, SteamSlot
from app.services import steam_cache, steam_day_overrides, steam_email, steam_events
from app.services.steam_settings import get_or_create_settings
from app.services.steam_tokens import gen_cancel_token, gen_qr_token, gen_unique_code


_ACTIVE_STATUSES = ("pending", "confirmed", "used")


def _limit_for(settings, service_type: str) -> int:
    """Per-service GLOBAL limit lookup (no per-day override). Use only when you
    don't have a Bali date in scope; the booking transaction prefers the
    override-aware lookup via `steam_day_overrides.effective_limit`."""
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
        raise HTTPException(status_code=400, detail={
            "error": "no_slots",
            "message": "Pick at least one session to continue.",
        })
    if len(slot_ids) != len(set(slot_ids)):
        raise HTTPException(status_code=400, detail={
            "error": "duplicate_slot_ids",
            "message": "Looks like the same session got selected twice — please refresh and try again.",
        })

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
        raise HTTPException(status_code=404, detail={
            "error": "slot_not_found",
            "message": "That session is no longer available. Refresh and pick another time.",
            "ids": [str(m) for m in missing],
        })

    # 2. Validate each slot
    for s in slots:
        if s.status != "open":
            raise HTTPException(status_code=409, detail={
                "error": "slot_closed",
                "message": "That session has just closed. Please pick another time.",
                "slot_id": str(s.id),
            })
        if s.starts_at <= now:
            raise HTTPException(status_code=409, detail={
                "error": "slot_past",
                "message": "That session has already started — please choose a later time today.",
                "slot_id": str(s.id),
            })
        if s.booked_count + 1 > s.capacity:
            raise HTTPException(status_code=409, detail={
                "error": "slot_full",
                "message": "Someone just took the last seat in that session — try another time.",
                "slot_id": str(s.id),
            })

    # 3. Per-guest limit check — separately per service_type AND per Bali-local day.
    #    A guest may book up to `max_bookings_per_guest` steam sessions AND
    #    `max_massage_bookings_per_guest` massages PER DAY. Different days are
    #    counted independently — booking 2 on Sunday doesn't block booking 2 on
    #    Monday. Postgres rejects COUNT(*) ... FOR UPDATE — we lock rows + count.
    identity_conditions = [func.lower(SteamBooking.guest_email) == email_norm]
    if device_fingerprint:
        identity_conditions.append(SteamBooking.device_fingerprint == device_fingerprint)
    active_rows = (
        db.query(SteamBooking.id, SteamBooking.service_type, SteamSlot.starts_at)
        .join(SteamSlot, SteamSlot.id == SteamBooking.slot_id)
        .filter(
            SteamBooking.status.in_(_ACTIVE_STATUSES),
            or_(*identity_conditions),
        )
        .with_for_update(of=SteamBooking)
        .all()
    )
    # key = (service_type, bali-local date) → count
    existing_by_key: dict[tuple[str, date], int] = {}
    for _id, svc, starts_at in active_rows:
        bali_day = starts_at.astimezone(BALI_TZ).date()
        key = (svc, bali_day)
        existing_by_key[key] = existing_by_key.get(key, 0) + 1

    requested_by_key: dict[tuple[str, date], int] = {}
    for s in slots:
        bali_day = s.starts_at.astimezone(BALI_TZ).date()
        key = (s.service_type, bali_day)
        requested_by_key[key] = requested_by_key.get(key, 0) + 1

    # Bulk-load per-day overrides for every day we touch in this transaction
    # (avoids one query per (svc, day) pair).
    relevant_days = sorted({day for (_svc, day) in requested_by_key})
    overrides_by_day = steam_day_overrides.get_many(db, relevant_days)

    for (svc, day), requested in requested_by_key.items():
        existing = existing_by_key.get((svc, day), 0)
        limit = steam_day_overrides.effective_limit(
            overrides_by_day.get(day),
            svc,
            default_steam=settings.max_bookings_per_guest,
            default_massage=settings.max_massage_bookings_per_guest,
        )
        if existing + requested > limit:
            steam_events.log_event(
                db,
                "booking_failed",
                properties={
                    "reason": "limit_exceeded",
                    "service_type": svc,
                    "day": day.isoformat(),
                    "existing": existing,
                    "requested": requested,
                    "limit": limit,
                },
                device_fingerprint=device_fingerprint,
                ip=ip,
                user_agent=user_agent,
            )
            db.commit()
            svc_label = "steam" if svc == "steam" else "massage"
            if existing >= limit:
                human = (
                    f"You already have {existing} {svc_label} {'session' if existing == 1 else 'sessions'} "
                    f"booked for today — that's our daily maximum. We'll see you then!"
                )
            else:
                human = (
                    f"We can host you for up to {limit} {svc_label} "
                    f"{'session' if limit == 1 else 'sessions'} per day, and you already have "
                    f"{existing}. Please pick {limit - existing} more or come back tomorrow."
                )
            raise HTTPException(
                status_code=409,
                detail={
                    "error": "limit_exceeded",
                    "message": human,
                    "service_type": svc,
                    "day": day.isoformat(),
                    "limit": limit,
                    "existing": existing,
                    "scope": "per_day",
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


def create_walkin(
    db: Session,
    *,
    slot_id: UUID,
    name: str,
    email: Optional[str] = None,
) -> SteamBooking:
    """Staff books a guest who walked up to the front desk.

    Differs from `create_bookings`:
      - status is 'confirmed' from the start (no email lifecycle gate even if Resend
        is configured — staff has the guest right there, no need to email)
      - email is optional; if missing we synthesise `walkin-{uuid}@local.atmos` so
        the NOT NULL constraint + unique-ish indexes still hold
      - capacity still enforced via SELECT FOR UPDATE; no overbook in MVP
      - per-day guest limit is NOT enforced (staff knows what they're doing — if
        a regular wants three sessions today, they get three)

    No email is sent for this booking at any stage.
    """
    from uuid import uuid4

    name = (name or "").strip()
    if not name:
        raise HTTPException(status_code=400, detail={"error": "name_required"})

    email_norm = (email or "").strip().lower()
    if not email_norm:
        email_norm = f"walkin-{uuid4().hex[:12]}@local.atmos"

    now = _now()

    slot = (
        db.query(SteamSlot)
        .filter(SteamSlot.id == slot_id)
        .with_for_update()
        .first()
    )
    if not slot:
        raise HTTPException(status_code=404, detail={"error": "slot_not_found"})
    if slot.status != "open":
        raise HTTPException(status_code=409, detail={"error": "slot_closed"})
    if slot.booked_count + 1 > slot.capacity:
        raise HTTPException(status_code=409, detail={"error": "slot_full"})

    booking = SteamBooking(
        code=gen_unique_code(db),
        service_type=slot.service_type,
        slot_id=slot.id,
        guest_email=email_norm,
        guest_name=name,
        device_fingerprint=None,
        status="confirmed",
        qr_token=gen_qr_token(),
        cancel_token=gen_cancel_token(),
        ip=None,
        user_agent=None,
        confirmed_at=now,
    )
    db.add(booking)
    slot.booked_count = slot.booked_count + 1

    db.flush()
    steam_events.log_event(
        db,
        "booking_created",
        properties={"status": "confirmed", "mode": "walkin"},
        booking_id=booking.id,
        slot_id=booking.slot_id,
    )
    db.commit()
    db.refresh(booking)
    steam_cache.invalidate()
    return booking


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
