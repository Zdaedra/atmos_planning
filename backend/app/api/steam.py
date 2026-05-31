"""Steam booking module API.

Phases delivered here:
  - Phase 1: settings, slot templates, slots, materialization
  - Phase 2: bookings (atomic FOR UPDATE), cancel, expire-tick, slots cache, rate-limit, events

Email / QR / staff scanner live in subsequent phases; see docs/steam-booking-spec.md.
"""
import csv
import io
import json
import os
from datetime import date, datetime, timedelta
from typing import Optional
from uuid import UUID

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Query, Request, Response, status
from fastapi.responses import PlainTextResponse
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.security import require_admin, require_internal
from app.core.time_utils import BALI_TZ
from app.models.steam import SteamBooking, SteamEvent, SteamSlot, SteamSlotTemplate
from app.schemas.steam import (
    PasswordLoginRequest,
    PasswordLoginResponse,
    BookingAdminRead,
    BookingByCodeRead,
    BookingCancelRequest,
    BookingCancelResponse,
    BookingCreate,
    BookingPublicRead,
    BookingResendRequest,
    BookingsCreateResponse,
    WalkinCreateRequest,
    ExpireResult,
    MaterializeResult,
    StaffVerifyRequest,
    StaffVerifyResponse,
    SteamSettingsRead,
    SteamSettingsUpdate,
    SteamSlotCreate,
    SteamSlotPublicRead,
    SteamSlotRead,
    SteamSlotTemplateCreate,
    SteamSlotTemplatePreviewRequest,
    SteamSlotTemplatePreviewResponse,
    SteamSlotTemplateRead,
    SteamSlotTemplateUpdate,
    SteamDayOverrideRead,
    SteamDayOverrideUpsert,
    SteamSlotUpdate,
)
from app.services import steam_bookings as bookings_svc
from app.services import steam_cache, steam_day_overrides, steam_email, steam_events, steam_qr, steam_rate_limit, steam_role_auth
from app.services.steam_materializer import (
    delete_unbooked_future_slots,
    materialize_all_active,
    materialize_template,
    preview_template_dates,
    propagate_template_to_unbooked_slots,
)
from app.services.steam_settings import get_or_create_settings

router = APIRouter()


# ---------------------------------------------------------------------------
# Public
# ---------------------------------------------------------------------------

@router.get("/settings/public")
def get_public_settings(db: Session = Depends(get_db)):
    """Subset of settings safe to expose to the guest UI: branding + per-day limits.
    `max_steam_per_day` / `max_massage_per_day` reflect *today's* effective limit
    (i.e., honor a steam_day_overrides row if one exists for today's Bali date).
    No Resend keys, no internal config. Cached aggressively client-side."""
    s = get_or_create_settings(db)
    today = datetime.now(BALI_TZ).date()
    override = steam_day_overrides.get(db, today)
    return {
        "festival_name": s.festival_name,
        "location_name": s.location_name,
        "max_steam_per_day": steam_day_overrides.effective_limit(
            override, "steam",
            default_steam=s.max_bookings_per_guest,
            default_massage=s.max_massage_bookings_per_guest,
        ),
        "max_massage_per_day": steam_day_overrides.effective_limit(
            override, "massage",
            default_steam=s.max_bookings_per_guest,
            default_massage=s.max_massage_bookings_per_guest,
        ),
        "qr_valid_before_slot_minutes": s.qr_valid_before_slot_minutes,
    }


@router.get("/slots", response_model=list[SteamSlotPublicRead])
def list_slots_public(
    request: Request,
    service: Optional[str] = Query(default=None, description="steam | massage"),
    db: Session = Depends(get_db),
):
    """Open slots for *today* (Bali wall-clock) only. Future days are intentionally not
    exposed to guests — bookings are accepted same-day-only as a product decision.
    Past slots in today are filtered out automatically (starts_at >= now). Result cached
    in-process for 5s — burst of guest loads collapses onto one DB query."""
    steam_rate_limit.limit_list_slots(request)

    now = datetime.now(BALI_TZ)
    today = now.date()
    from_ = now  # never show slots already started
    to = datetime.combine(today + timedelta(days=1), datetime.min.time(), tzinfo=BALI_TZ)

    cache_key = ("slots", from_.isoformat(), to.isoformat(), service or "_all")
    cached = steam_cache.get(cache_key)
    if cached is not None:
        return cached

    q = db.query(SteamSlot).filter(
        SteamSlot.status == "open",
        SteamSlot.starts_at >= from_,
        SteamSlot.starts_at < to,
    )
    if service:
        q = q.filter(SteamSlot.service_type == service)
    rows = q.order_by(SteamSlot.starts_at.asc()).all()
    # Serialize once so cache stores immutable dicts (rows from ORM aren't safe
    # across sessions/refreshes).
    serialized = [SteamSlotPublicRead.model_validate(r).model_dump() for r in rows]
    steam_cache.set(cache_key, serialized)
    return serialized


# ---------------------------------------------------------------------------
# Public — bookings
# ---------------------------------------------------------------------------

def _slot_times_for(db: Session, slot_ids: list[UUID]) -> dict[UUID, tuple[datetime, datetime]]:
    rows = db.query(SteamSlot.id, SteamSlot.starts_at, SteamSlot.ends_at).filter(
        SteamSlot.id.in_(slot_ids)
    ).all()
    return {r[0]: (r[1], r[2]) for r in rows}


@router.post("/bookings", response_model=BookingsCreateResponse, status_code=201)
def create_booking(
    payload: BookingCreate,
    request: Request,
    background: BackgroundTasks,
    db: Session = Depends(get_db),
):
    steam_rate_limit.limit_create_booking(request, payload.fingerprint)
    ip = steam_rate_limit.client_ip(request)
    ua = request.headers.get("user-agent")

    bookings = bookings_svc.create_bookings(
        db,
        slot_ids=payload.slot_ids,
        email=payload.email,
        name=payload.name,
        device_fingerprint=payload.fingerprint,
        ip=ip,
        user_agent=ua,
    )

    # Fire confirmation email in the background — POST returns immediately to the guest.
    # The email service is a no-op if resend_from_email isn't configured yet, so this
    # works in both Phase 2 (instant-confirm) and Phase 3+ (email-gated) modes.
    background.add_task(_send_confirmation_in_bg, [b.id for b in bookings])

    slot_times = _slot_times_for(db, [b.slot_id for b in bookings])
    return BookingsCreateResponse(
        bookings=[
            BookingPublicRead(
                id=b.id,
                code=b.code,
                service_type=b.service_type,
                slot_id=b.slot_id,
                slot_starts_at=slot_times[b.slot_id][0],
                slot_ends_at=slot_times[b.slot_id][1],
                status=b.status,
                qr_token=b.qr_token,
                cancel_token=b.cancel_token,
                guest_email=b.guest_email,
                created_at=b.created_at,
            )
            for b in bookings
        ]
    )


def _send_confirmation_in_bg(booking_ids: list[UUID]) -> None:
    """BackgroundTasks runs after the request commits; spin up our own db session."""
    from app.core.database import SessionLocal
    db = SessionLocal()
    try:
        steam_email.send_booking_confirmation(db, booking_ids)
    finally:
        db.close()


def _send_cancellation_in_bg(booking_id: UUID) -> None:
    from app.core.database import SessionLocal
    db = SessionLocal()
    try:
        steam_email.send_cancellation(db, booking_id)
    finally:
        db.close()


@router.get("/bookings/by-code/{code}", response_model=BookingByCodeRead)
def get_booking_by_code(code: str, db: Session = Depends(get_db)):
    booking = db.query(SteamBooking).filter(SteamBooking.code == code).first()
    if not booking:
        raise HTTPException(status_code=404, detail={"error": "not_found"})
    slot = db.query(SteamSlot).filter(SteamSlot.id == booking.slot_id).first()
    return BookingByCodeRead(
        id=booking.id,
        code=booking.code,
        service_type=booking.service_type,
        status=booking.status,
        slot_id=booking.slot_id,
        slot_starts_at=slot.starts_at if slot else None,
        slot_ends_at=slot.ends_at if slot else None,
        qr_token=booking.qr_token,
        guest_email=booking.guest_email,
    )


@router.get("/qr/{qr_token}.png")
def get_qr_png(qr_token: UUID, db: Session = Depends(get_db)):
    """Render the booking's QR as PNG. The token itself is the secret — we don't
    enforce auth here, but anyone who has the token has equivalent power to the
    guest (and they can't do anything with it except show it to staff)."""
    booking = db.query(SteamBooking).filter(SteamBooking.qr_token == qr_token).first()
    if not booking:
        raise HTTPException(status_code=404, detail={"error": "not_found"})
    png = steam_qr.render_png(str(qr_token))
    return Response(
        content=png,
        media_type="image/png",
        headers={"Cache-Control": "no-store"},
    )


@router.post("/bookings/cancel", response_model=BookingCancelResponse)
def cancel_booking_by_token(
    payload: BookingCancelRequest,
    request: Request,
    background: BackgroundTasks,
    db: Session = Depends(get_db),
):
    ip = steam_rate_limit.client_ip(request)
    ua = request.headers.get("user-agent")
    booking = bookings_svc.cancel_by_token(
        db, payload.cancel_token, actor="guest", ip=ip, user_agent=ua
    )
    background.add_task(_send_cancellation_in_bg, booking.id)
    return BookingCancelResponse(
        id=booking.id,
        code=booking.code,
        status=booking.status,
        cancelled_at=booking.cancelled_at,
    )


@router.post("/bookings/resend")
def resend_bookings_email(
    payload: BookingResendRequest,
    request: Request,
    background: BackgroundTasks,
    db: Session = Depends(get_db),
):
    """Re-email the guest with all their active bookings (and one QR per booking)."""
    email = payload.email.strip().lower()
    steam_rate_limit.limit_resend_email(email)
    background.add_task(_resend_email_bg, email)
    return {"ok": True}


def _resend_email_bg(email: str) -> None:
    from app.core.database import SessionLocal
    db = SessionLocal()
    try:
        steam_email.send_resend_bookings(db, email)
    finally:
        db.close()


# ---------------------------------------------------------------------------
# Admin — settings
# ---------------------------------------------------------------------------

def _settings_to_read(row) -> SteamSettingsRead:
    """Strip password hashes; surface only the `_set` booleans the admin UI shows."""
    return SteamSettingsRead(
        max_bookings_per_guest=row.max_bookings_per_guest,
        max_massage_bookings_per_guest=row.max_massage_bookings_per_guest,
        booking_window_minutes=row.booking_window_minutes,
        qr_valid_before_slot_minutes=row.qr_valid_before_slot_minutes,
        materialization_horizon_weeks=row.materialization_horizon_weeks,
        festival_name=row.festival_name,
        location_name=row.location_name,
        resend_from_email=row.resend_from_email,
        resend_reply_to=row.resend_reply_to,
        public_url=row.public_url,
        reception_password_set=bool(row.reception_password_hash),
        scanner_password_set=bool(row.scanner_password_hash),
        updated_at=row.updated_at,
    )


@router.get("/admin/settings", response_model=SteamSettingsRead)
def get_settings(_admin=Depends(require_admin), db: Session = Depends(get_db)):
    return _settings_to_read(get_or_create_settings(db))


@router.patch("/admin/settings", response_model=SteamSettingsRead)
def update_settings(
    payload: SteamSettingsUpdate,
    _admin=Depends(require_admin),
    db: Session = Depends(get_db),
):
    row = get_or_create_settings(db)
    data = payload.model_dump(exclude_unset=True)

    # Password fields are write-only: plaintext in, hash to DB, never echoed back.
    # Empty string explicitly clears (disables the SPA until a new password is set);
    # None / missing means "don't touch this column".
    for plain_field, hash_field in (
        ("reception_password", "reception_password_hash"),
        ("scanner_password",   "scanner_password_hash"),
    ):
        if plain_field not in data:
            continue
        plain = data.pop(plain_field)
        if plain is None:
            continue
        if plain == "":
            setattr(row, hash_field, None)
        else:
            setattr(row, hash_field, steam_role_auth.hash_password(plain))

    for k, v in data.items():
        setattr(row, k, v)
    db.commit()
    db.refresh(row)
    return _settings_to_read(row)


# ---------------------------------------------------------------------------
# Tablet password auth — shared password per role (reception, scanner)
# ---------------------------------------------------------------------------

@router.post("/reception/login", response_model=PasswordLoginResponse)
def reception_login(payload: PasswordLoginRequest, db: Session = Depends(get_db)):
    s = get_or_create_settings(db)
    if not s.reception_password_hash:
        raise HTTPException(status_code=503, detail={
            "error": "role_password_not_set",
            "message": "Reception password isn't configured yet. Ask the manager to set it in admin → Settings.",
        })
    expected = s.reception_password_hash
    given = steam_role_auth.hash_password((payload.password or "").strip())
    if given != expected:
        raise HTTPException(status_code=401, detail={
            "error": "wrong_password",
            "message": "Wrong password — please try again.",
        })
    return PasswordLoginResponse(token=expected)


@router.post("/scanner/login", response_model=PasswordLoginResponse)
def scanner_login(payload: PasswordLoginRequest, db: Session = Depends(get_db)):
    s = get_or_create_settings(db)
    if not s.scanner_password_hash:
        raise HTTPException(status_code=503, detail={
            "error": "role_password_not_set",
            "message": "Scanner password isn't configured yet. Ask the manager to set it in admin → Settings.",
        })
    expected = s.scanner_password_hash
    given = steam_role_auth.hash_password((payload.password or "").strip())
    if given != expected:
        raise HTTPException(status_code=401, detail={
            "error": "wrong_password",
            "message": "Wrong password — please try again.",
        })
    return PasswordLoginResponse(token=expected)


# ---------------------------------------------------------------------------
# Admin — per-day overrides of per-guest booking limit
# ---------------------------------------------------------------------------

def _parse_iso_day(value: str) -> date:
    try:
        return datetime.strptime(value, "%Y-%m-%d").date()
    except ValueError:
        raise HTTPException(status_code=400, detail={"error": "bad_date", "expected": "YYYY-MM-DD"})


@router.get("/admin/day-overrides/{date_str}")
def admin_get_day_override(
    date_str: str,
    _admin=Depends(require_admin),
    db: Session = Depends(get_db),
):
    """Returns the override row for that Bali date, or 200 with nulls if absent.
    Frontend uses the absent shape to render "(default)" placeholders."""
    day = _parse_iso_day(date_str)
    row = steam_day_overrides.get(db, day)
    settings = get_or_create_settings(db)
    return {
        "day": day.isoformat(),
        "max_steam_per_guest": (row.max_steam_per_guest if row else None),
        "max_massage_per_guest": (row.max_massage_per_guest if row else None),
        "note": (row.note if row else None),
        "defaults": {
            "max_steam_per_guest": settings.max_bookings_per_guest,
            "max_massage_per_guest": settings.max_massage_bookings_per_guest,
        },
    }


@router.put("/admin/day-overrides/{date_str}")
def admin_upsert_day_override(
    date_str: str,
    payload: SteamDayOverrideUpsert,
    _admin=Depends(require_admin),
    db: Session = Depends(get_db),
):
    day = _parse_iso_day(date_str)
    steam_day_overrides.upsert(
        db, day,
        max_steam_per_guest=payload.max_steam_per_guest,
        max_massage_per_guest=payload.max_massage_per_guest,
        note=payload.note,
    )
    steam_events.log_event(
        db,
        "day_override_set",
        properties={
            "day": day.isoformat(),
            "max_steam_per_guest": payload.max_steam_per_guest,
            "max_massage_per_guest": payload.max_massage_per_guest,
        },
    )
    db.commit()
    return admin_get_day_override(date_str, _admin=None, db=db)  # type: ignore[arg-type]


@router.delete("/admin/day-overrides/{date_str}", status_code=204)
def admin_delete_day_override(
    date_str: str,
    _admin=Depends(require_admin),
    db: Session = Depends(get_db),
):
    day = _parse_iso_day(date_str)
    removed = steam_day_overrides.delete(db, day)
    if removed:
        steam_events.log_event(db, "day_override_cleared", properties={"day": day.isoformat()})
    db.commit()
    return Response(status_code=204)


# ---------------------------------------------------------------------------
# Admin — templates
# ---------------------------------------------------------------------------

@router.get("/admin/templates", response_model=list[SteamSlotTemplateRead])
def list_templates(_admin=Depends(require_admin), db: Session = Depends(get_db)):
    return (
        db.query(SteamSlotTemplate)
        .order_by(SteamSlotTemplate.created_at.desc())
        .all()
    )


@router.post("/admin/templates", response_model=SteamSlotTemplateRead, status_code=201)
def create_template(
    payload: SteamSlotTemplateCreate,
    _admin=Depends(require_admin),
    db: Session = Depends(get_db),
):
    """Create + synchronous materialization over the current horizon, so the manager sees
    the slots immediately in the calendar (not "tomorrow when the daily tick runs")."""
    tpl = SteamSlotTemplate(
        name=payload.name,
        service_type=payload.service_type,
        days_of_week=payload.days_of_week,
        start_time=payload.start_time,
        duration_minutes=payload.duration_minutes,
        capacity=payload.capacity,
        starts_on=payload.starts_on,
        repeats_until=payload.repeats_until,
        status="active",
        therapist=payload.therapist,
        room=payload.room,
        variant=payload.variant,
    )
    db.add(tpl)
    db.flush()  # need tpl.id for materialize

    settings = get_or_create_settings(db)
    today = datetime.now(BALI_TZ).date()
    horizon_end = today + timedelta(weeks=settings.materialization_horizon_weeks)
    materialize_template(db, tpl, horizon_end, today=today)

    db.commit()
    db.refresh(tpl)
    steam_cache.invalidate()
    return tpl


@router.get("/admin/templates/{template_id}", response_model=SteamSlotTemplateRead)
def get_template(
    template_id: UUID,
    _admin=Depends(require_admin),
    db: Session = Depends(get_db),
):
    tpl = db.query(SteamSlotTemplate).filter(SteamSlotTemplate.id == template_id).first()
    if not tpl:
        raise HTTPException(status_code=404, detail="Template not found")
    return tpl


@router.patch("/admin/templates/{template_id}", response_model=SteamSlotTemplateRead)
def update_template(
    template_id: UUID,
    payload: SteamSlotTemplateUpdate,
    _admin=Depends(require_admin),
    db: Session = Depends(get_db),
):
    """Phase 1 implementation: applies field changes to the template only, then re-materializes.
    Existing materialized slots without bookings get their fields recalculated (capacity/time);
    overrides and closed-tombstones are never touched. `apply_mode=notify_all` for slots with
    bookings becomes meaningful once Phase 2 adds steam_bookings — for now we leave booked
    slots alone regardless of apply_mode (no bookings exist).
    """
    tpl = db.query(SteamSlotTemplate).filter(SteamSlotTemplate.id == template_id).first()
    if not tpl:
        raise HTTPException(status_code=404, detail="Template not found")

    data = payload.model_dump(exclude_unset=True)
    data.pop("apply_mode", None)  # reserved for Phase 2 booking-aware edits

    if "status" in data and data["status"] not in {"active", "paused"}:
        raise HTTPException(status_code=400, detail="status must be 'active' or 'paused'")

    for k, v in data.items():
        setattr(tpl, k, v)
    db.flush()

    # Apply the new template fields to existing future unbooked slots — otherwise a
    # time/capacity change would silently leave them at the old values (the bug from
    # the self-review). Booked slots and overrides are intentionally left alone;
    # apply_mode='notify_all' (Phase 2 booking-aware edit) is not implemented yet.
    propagated = propagate_template_to_unbooked_slots(db, tpl)

    # Re-materialize horizon; unchanged dates skip, missing dates appear (e.g. when
    # the manager extended `repeats_until`).
    settings = get_or_create_settings(db)
    today = datetime.now(BALI_TZ).date()
    horizon_end = today + timedelta(weeks=settings.materialization_horizon_weeks)
    materialize_template(db, tpl, horizon_end, today=today)

    db.commit()
    db.refresh(tpl)
    steam_cache.invalidate()
    return tpl


@router.delete("/admin/templates/{template_id}", status_code=204)
def delete_template(
    template_id: UUID,
    _admin=Depends(require_admin),
    db: Session = Depends(get_db),
):
    """Hard-delete. Allowed only when the template has NO bookings — past or future —
    so we don't orphan analytics history (steam_bookings.slot_id would dangle).
    For templates that have ever been used: the manager should pause instead. Pausing
    keeps the template visible (status='paused') and removes only future unbooked slots.
    """
    tpl = db.query(SteamSlotTemplate).filter(SteamSlotTemplate.id == template_id).first()
    if not tpl:
        raise HTTPException(status_code=404, detail="Template not found")

    # Has this template EVER produced a booking?
    historical = (
        db.query(SteamBooking)
        .join(SteamSlot, SteamSlot.id == SteamBooking.slot_id)
        .filter(SteamSlot.template_id == template_id)
        .first()
        is not None
    )
    if historical:
        raise HTTPException(
            status_code=409,
            detail={
                "error": "template_has_history",
                "message": "Template has booking history (past or future). Pause it instead — pausing removes future unbooked slots but keeps the audit trail.",
            },
        )

    # No bookings ever exist → safe to wipe template and its (un-booked) slots.
    db.query(SteamSlot).filter(SteamSlot.template_id == template_id).delete(
        synchronize_session=False
    )
    db.delete(tpl)
    db.commit()
    steam_cache.invalidate()
    return None


@router.post(
    "/admin/templates/preview",
    response_model=SteamSlotTemplatePreviewResponse,
)
def preview_template(
    payload: SteamSlotTemplatePreviewRequest,
    _admin=Depends(require_admin),
):
    dates = preview_template_dates(
        days_of_week=payload.days_of_week,
        starts_on=payload.starts_on,
        repeats_until=payload.repeats_until,
        limit=payload.limit,
    )
    return SteamSlotTemplatePreviewResponse(dates=dates)


@router.post("/admin/templates/{template_id}/pause", response_model=SteamSlotTemplateRead)
def pause_template(
    template_id: UUID,
    _admin=Depends(require_admin),
    db: Session = Depends(get_db),
):
    """Pause: status → 'paused', future unbooked slots deleted, booked slots stay."""
    tpl = db.query(SteamSlotTemplate).filter(SteamSlotTemplate.id == template_id).first()
    if not tpl:
        raise HTTPException(status_code=404, detail="Template not found")
    tpl.status = "paused"
    delete_unbooked_future_slots(db, template_id)
    db.commit()
    db.refresh(tpl)
    steam_cache.invalidate()
    return tpl


# ---------------------------------------------------------------------------
# Admin — slots
# ---------------------------------------------------------------------------

@router.get("/admin/slots", response_model=list[SteamSlotRead])
def admin_list_slots(
    from_: Optional[datetime] = Query(default=None, alias="from"),
    to: Optional[datetime] = Query(default=None),
    template_id: Optional[UUID] = None,
    service: Optional[str] = Query(default=None, description="steam | massage"),
    _admin=Depends(require_admin),
    db: Session = Depends(get_db),
):
    """Full admin view (includes closed/override). Default window: now ± 1 month."""
    now = datetime.now(BALI_TZ)
    if from_ is None:
        from_ = now - timedelta(days=30)
    if to is None:
        to = now + timedelta(days=60)
    q = (
        db.query(SteamSlot)
        .filter(SteamSlot.starts_at >= from_, SteamSlot.starts_at < to)
    )
    if template_id is not None:
        q = q.filter(SteamSlot.template_id == template_id)
    if service:
        q = q.filter(SteamSlot.service_type == service)
    return q.order_by(SteamSlot.starts_at.asc()).all()


@router.post("/admin/slots", response_model=SteamSlotRead, status_code=201)
def admin_create_slot(
    payload: SteamSlotCreate,
    _admin=Depends(require_admin),
    db: Session = Depends(get_db),
):
    """Standalone (one-off) slot — no template_id, not subject to template re-materialization."""
    if payload.ends_at <= payload.starts_at:
        raise HTTPException(status_code=400, detail="ends_at must be after starts_at")
    slot = SteamSlot(
        service_type=payload.service_type,
        starts_at=payload.starts_at,
        ends_at=payload.ends_at,
        capacity=payload.capacity,
        booked_count=0,
        template_id=None,
        is_override=False,  # standalone — irrelevant flag, kept false
        status="open",
        therapist=payload.therapist,
        room=payload.room,
        variant=payload.variant,
    )
    db.add(slot)
    db.commit()
    db.refresh(slot)
    steam_cache.invalidate()
    return slot


@router.get("/admin/slots/{slot_id}", response_model=SteamSlotRead)
def admin_get_slot(
    slot_id: UUID,
    _admin=Depends(require_admin),
    db: Session = Depends(get_db),
):
    slot = db.query(SteamSlot).filter(SteamSlot.id == slot_id).first()
    if not slot:
        raise HTTPException(status_code=404, detail="Slot not found")
    return slot


@router.patch("/admin/slots/{slot_id}", response_model=SteamSlotRead)
def admin_update_slot(
    slot_id: UUID,
    payload: SteamSlotUpdate,
    _admin=Depends(require_admin),
    db: Session = Depends(get_db),
):
    """Editing an individual slot pins it: is_override=true if it came from a template,
    so subsequent template re-materialization leaves it alone."""
    slot = db.query(SteamSlot).filter(SteamSlot.id == slot_id).first()
    if not slot:
        raise HTTPException(status_code=404, detail="Slot not found")

    data = payload.model_dump(exclude_unset=True)
    if "status" in data and data["status"] not in {"open", "closed"}:
        raise HTTPException(status_code=400, detail="status must be 'open' or 'closed'")

    new_starts = data.get("starts_at", slot.starts_at)
    new_ends = data.get("ends_at", slot.ends_at)
    if new_ends <= new_starts:
        raise HTTPException(status_code=400, detail="ends_at must be after starts_at")

    new_capacity = data.get("capacity", slot.capacity)
    if new_capacity < slot.booked_count:
        raise HTTPException(
            status_code=400,
            detail=f"capacity ({new_capacity}) cannot be less than current booked_count ({slot.booked_count})",
        )

    for k, v in data.items():
        setattr(slot, k, v)
    if slot.template_id is not None:
        slot.is_override = True
    db.commit()
    db.refresh(slot)
    steam_cache.invalidate()
    return slot


@router.delete("/admin/slots/{slot_id}", status_code=204)
def admin_delete_slot(
    slot_id: UUID,
    _admin=Depends(require_admin),
    db: Session = Depends(get_db),
):
    """Standalone slots are hard-deleted. Materialized slots become a tombstone
    (status='closed' + is_override=true) so the daily materializer doesn't recreate them."""
    slot = db.query(SteamSlot).filter(SteamSlot.id == slot_id).first()
    if not slot:
        raise HTTPException(status_code=404, detail="Slot not found")
    if slot.booked_count > 0:
        raise HTTPException(
            status_code=409,
            detail="Slot has active bookings; cancel them before deleting.",
        )

    if slot.template_id is None:
        db.delete(slot)
    else:
        slot.status = "closed"
        slot.is_override = True
    db.commit()
    steam_cache.invalidate()
    return None


# ---------------------------------------------------------------------------
# Internal — cron tick
# ---------------------------------------------------------------------------

@router.post("/internal/materialize", response_model=MaterializeResult)
def internal_materialize(
    _ok: bool = Depends(require_internal),
    db: Session = Depends(get_db),
):
    """Daily tick. ai_monitor calls this with X-Internal-Token header."""
    totals = materialize_all_active(db)
    db.commit()
    steam_cache.invalidate()
    return MaterializeResult(**totals)


@router.post("/internal/expire-bookings", response_model=ExpireResult)
def internal_expire_bookings(
    _ok: bool = Depends(require_internal),
    db: Session = Depends(get_db),
):
    """Per-minute tick. Promotes pending bookings past their email-delivery window to
    'expired', and confirmed bookings past their slot start to 'expired' (no-show).
    Capacity is intentionally NOT released on expiry."""
    result = bookings_svc.expire_overdue(db)
    return ExpireResult(**result)


# ---------------------------------------------------------------------------
# Door scanner — QR verify (shared-password auth, see steam_role_auth)
# ---------------------------------------------------------------------------

@router.post("/staff/verify", response_model=StaffVerifyResponse)
def staff_verify(
    payload: StaffVerifyRequest,
    _=Depends(steam_role_auth.require_scanner_password),
    db: Session = Depends(get_db),
):
    # Shared-password auth — no per-staff id, so verify_qr logs the scan with
    # no staff_id attribution. If per-staff audit ever matters again, swap back
    # to require_staff and a magic-link issued per device.
    result = bookings_svc.verify_qr(db, payload.qr_token, staff_id=None)
    return StaffVerifyResponse(**result)


# ---------------------------------------------------------------------------
# Reception portal — gated by the shared-password dep in steam_role_auth. Lives
# on its own
# subdomain (reception.atmos-steam.com) so the front-of-house staff never see
# the full admin SPA.
# ---------------------------------------------------------------------------

@router.get("/reception/settings")
def reception_settings(_=Depends(steam_role_auth.require_reception_password), db: Session = Depends(get_db)):
    """Subset of settings the reception SPA shows in its header."""
    s = get_or_create_settings(db)
    return {
        "festival_name": s.festival_name,
        "location_name": s.location_name,
        "qr_valid_before_slot_minutes": s.qr_valid_before_slot_minutes,
    }


@router.get("/reception/day")
def reception_day(
    date: Optional[str] = Query(default=None),
    service: Optional[str] = Query(default=None),
    _=Depends(steam_role_auth.require_reception_password),
    db: Session = Depends(get_db),
):
    """Same shape as /admin/day; reception accounts call this from their portal."""
    return admin_day_view(date=date, service=service, _admin=None, db=db)  # type: ignore[arg-type]


@router.post("/reception/walkin", response_model=BookingAdminRead, status_code=201)
def reception_walkin(
    payload: WalkinCreateRequest,
    _=Depends(steam_role_auth.require_reception_password),
    db: Session = Depends(get_db),
):
    booking = bookings_svc.create_walkin(
        db, slot_id=payload.slot_id, name=payload.name, email=payload.email,
    )
    slot = db.query(SteamSlot).filter(SteamSlot.id == booking.slot_id).first()
    return BookingAdminRead(
        id=booking.id, code=booking.code, service_type=booking.service_type,
        slot_id=booking.slot_id,
        slot_starts_at=slot.starts_at if slot else None,
        guest_email=booking.guest_email, guest_name=booking.guest_name,
        device_fingerprint=None, status=booking.status,
        qr_token=booking.qr_token, cancel_token=booking.cancel_token,
        ip=None, user_agent=None,
        created_at=booking.created_at, confirmed_at=booking.confirmed_at,
        cancelled_at=None, entered_at=None,
    )


@router.post("/reception/bookings/{booking_id}/cancel", response_model=BookingCancelResponse)
def reception_cancel_booking(
    booking_id: UUID,
    _=Depends(steam_role_auth.require_reception_password),
    db: Session = Depends(get_db),
):
    booking = bookings_svc.cancel_by_id(db, booking_id, actor="admin")  # event log = admin (close enough)
    return BookingCancelResponse(
        id=booking.id, code=booking.code, status=booking.status,
        cancelled_at=booking.cancelled_at,
    )


# ---------------------------------------------------------------------------
# Admin — bookings
# ---------------------------------------------------------------------------

@router.get("/admin/bookings")
def admin_list_bookings(
    status_: Optional[str] = Query(default=None, alias="status"),
    from_: Optional[datetime] = Query(default=None, alias="from"),
    to: Optional[datetime] = Query(default=None),
    email: Optional[str] = None,
    slot_id: Optional[UUID] = None,
    service: Optional[str] = Query(default=None, description="steam | massage"),
    export: Optional[str] = Query(default=None, description="csv to download CSV"),
    limit: int = Query(default=200, ge=1, le=2000),
    offset: int = Query(default=0, ge=0),
    _admin=Depends(require_admin),
    db: Session = Depends(get_db),
):
    """List bookings with filters; ?export=csv returns a CSV download.

    Status filter accepts comma-separated values (e.g. `status=confirmed,used`).
    """
    q = db.query(SteamBooking, SteamSlot).join(
        SteamSlot, SteamSlot.id == SteamBooking.slot_id
    )
    if status_:
        wanted = [s.strip() for s in status_.split(",") if s.strip()]
        q = q.filter(SteamBooking.status.in_(wanted))
    if email:
        q = q.filter(SteamBooking.guest_email.ilike(f"%{email.lower()}%"))
    if slot_id:
        q = q.filter(SteamBooking.slot_id == slot_id)
    if service:
        q = q.filter(SteamBooking.service_type == service)
    if from_:
        q = q.filter(SteamSlot.starts_at >= from_)
    if to:
        q = q.filter(SteamSlot.starts_at < to)
    q = q.order_by(SteamSlot.starts_at.desc(), SteamBooking.created_at.desc())

    if export == "csv":
        # Stream-friendly CSV (full result, no pagination) — admin export is bounded
        # by date filters; bound limit defensively to 10k anyway.
        rows = q.limit(10000).all()
        buf = io.StringIO()
        writer = csv.writer(buf)
        writer.writerow([
            "code", "service_type", "status", "slot_starts_at", "slot_ends_at",
            "therapist", "room", "variant",
            "guest_email", "guest_name", "device_fingerprint",
            "created_at", "confirmed_at", "cancelled_at", "entered_at",
            "ip", "user_agent",
        ])
        for booking, slot in rows:
            writer.writerow([
                booking.code,
                booking.service_type,
                booking.status,
                slot.starts_at.isoformat() if slot.starts_at else "",
                slot.ends_at.isoformat() if slot.ends_at else "",
                slot.therapist or "",
                slot.room or "",
                slot.variant or "",
                booking.guest_email,
                booking.guest_name or "",
                booking.device_fingerprint or "",
                booking.created_at.isoformat() if booking.created_at else "",
                booking.confirmed_at.isoformat() if booking.confirmed_at else "",
                booking.cancelled_at.isoformat() if booking.cancelled_at else "",
                booking.entered_at.isoformat() if booking.entered_at else "",
                str(booking.ip or ""),
                booking.user_agent or "",
            ])
        return Response(
            content=buf.getvalue(),
            media_type="text/csv",
            headers={"Content-Disposition": 'attachment; filename="steam_bookings.csv"'},
        )

    # Fetch one extra row to know if there's a next page without a separate count().
    fetched = q.limit(limit + 1).offset(offset).all()
    has_next = len(fetched) > limit
    rows = fetched[:limit]
    return {
        "has_next": has_next,
        "items": [
            BookingAdminRead(
                id=b.id,
                code=b.code,
                service_type=b.service_type,
                slot_id=b.slot_id,
                slot_starts_at=s.starts_at,
                guest_email=b.guest_email,
                guest_name=b.guest_name,
                device_fingerprint=b.device_fingerprint,
                status=b.status,
                qr_token=b.qr_token,
                cancel_token=b.cancel_token,
                ip=str(b.ip) if b.ip else None,
                user_agent=b.user_agent,
                created_at=b.created_at,
                confirmed_at=b.confirmed_at,
                cancelled_at=b.cancelled_at,
                entered_at=b.entered_at,
            ).model_dump(mode="json")
            for b, s in rows
        ],
        "limit": limit,
        "offset": offset,
    }


@router.get("/admin/bookings/{booking_id}")
def admin_booking_detail(
    booking_id: UUID,
    _admin=Depends(require_admin),
    db: Session = Depends(get_db),
):
    """Full booking record + slot context + recent events. Used by the BookingDetailsDrawer."""
    booking = db.query(SteamBooking).filter(SteamBooking.id == booking_id).first()
    if not booking:
        raise HTTPException(status_code=404, detail={"error": "not_found"})
    slot = db.query(SteamSlot).filter(SteamSlot.id == booking.slot_id).first()
    events = (
        db.query(SteamEvent)
        .filter(SteamEvent.booking_id == booking_id)
        .order_by(SteamEvent.created_at.asc())
        .limit(50)
        .all()
    )
    return {
        "booking": BookingAdminRead(
            id=booking.id,
            code=booking.code,
            service_type=booking.service_type,
            slot_id=booking.slot_id,
            slot_starts_at=slot.starts_at if slot else None,
            guest_email=booking.guest_email,
            guest_name=booking.guest_name,
            device_fingerprint=booking.device_fingerprint,
            status=booking.status,
            qr_token=booking.qr_token,
            cancel_token=booking.cancel_token,
            ip=str(booking.ip) if booking.ip else None,
            user_agent=booking.user_agent,
            created_at=booking.created_at,
            confirmed_at=booking.confirmed_at,
            cancelled_at=booking.cancelled_at,
            entered_at=booking.entered_at,
        ).model_dump(mode="json"),
        "slot": {
            "id": str(slot.id) if slot else None,
            "starts_at": slot.starts_at.isoformat() if slot and slot.starts_at else None,
            "ends_at": slot.ends_at.isoformat() if slot and slot.ends_at else None,
            "capacity": slot.capacity if slot else None,
            "booked_count": slot.booked_count if slot else None,
            "service_type": slot.service_type if slot else None,
            "therapist": slot.therapist if slot else None,
            "room": slot.room if slot else None,
            "variant": slot.variant if slot else None,
        } if slot else None,
        "events": [
            {
                "event_type": e.event_type,
                "properties": e.properties or {},
                "created_at": e.created_at.isoformat() if e.created_at else None,
            }
            for e in events
        ],
    }


@router.get("/admin/day")
def admin_day_view(
    date: Optional[str] = Query(default=None, description="YYYY-MM-DD in Bali tz; default = today"),
    service: Optional[str] = Query(default=None, description="steam | massage"),
    _admin=Depends(require_admin),
    db: Session = Depends(get_db),
):
    """Operational dashboard for a single day: every slot + the bookings on it,
    fetched in two queries (slots + bookings WHERE slot_id IN (...)) to avoid N+1.

    Used by /steam/today in the admin UI. The shape is intentionally denormalized
    so the page doesn't have to glue two endpoints.
    """
    # Parse date as Bali wall-clock day; fall back to today.
    try:
        if date:
            day = datetime.strptime(date, "%Y-%m-%d").date()
        else:
            day = datetime.now(BALI_TZ).date()
    except ValueError:
        raise HTTPException(status_code=400, detail={"error": "bad_date", "expected": "YYYY-MM-DD"})

    day_start = datetime.combine(day, datetime.min.time(), tzinfo=BALI_TZ)
    day_end = day_start + timedelta(days=1)

    slot_q = (
        db.query(SteamSlot)
        .filter(SteamSlot.starts_at >= day_start, SteamSlot.starts_at < day_end)
    )
    if service:
        slot_q = slot_q.filter(SteamSlot.service_type == service)
    slots = slot_q.order_by(SteamSlot.starts_at.asc()).all()

    # Single bookings query for all slot ids of this day.
    slot_ids = [s.id for s in slots]
    bookings_by_slot: dict = {sid: [] for sid in slot_ids}
    if slot_ids:
        bookings = (
            db.query(SteamBooking)
            .filter(SteamBooking.slot_id.in_(slot_ids))
            .order_by(SteamBooking.created_at.asc())
            .all()
        )
        for b in bookings:
            bookings_by_slot[b.slot_id].append(b)

    # Build response — slot card with nested guests.
    # `bookings` only includes ACTIVE bookings (pending/confirmed/used). Cancelled
    # and expired ones live in the bookings ledger for history but should never
    # render in the day-pane card — otherwise managers see "ghost" rows after
    # cancelling a guest while the slot counter shows the correct decremented
    # count, which is exactly what looks like a bug to them.
    def serialize_slot(s: SteamSlot) -> dict:
        bs = bookings_by_slot.get(s.id, [])
        active = [b for b in bs if b.status in ("pending", "confirmed", "used")]
        return {
            "id": str(s.id),
            "service_type": s.service_type,
            "starts_at": s.starts_at.isoformat(),
            "ends_at": s.ends_at.isoformat(),
            "capacity": s.capacity,
            "booked_count": s.booked_count,
            "status": s.status,
            "is_override": s.is_override,
            "template_id": str(s.template_id) if s.template_id else None,
            "therapist": s.therapist,
            "room": s.room,
            "variant": s.variant,
            "bookings": [
                {
                    "id": str(b.id),
                    "code": b.code,
                    "status": b.status,
                    "guest_email": b.guest_email,
                    "guest_name": b.guest_name,
                    "qr_token": str(b.qr_token),
                    "created_at": b.created_at.isoformat() if b.created_at else None,
                    "entered_at": b.entered_at.isoformat() if b.entered_at else None,
                }
                for b in active
            ],
            "active_count": len(active),
        }

    # Aggregate stats
    by_service: dict = {"steam": {"slots": 0, "active_bookings": 0}, "massage": {"slots": 0, "active_bookings": 0}}
    for s in slots:
        if s.service_type in by_service:
            by_service[s.service_type]["slots"] += 1
            by_service[s.service_type]["active_bookings"] += sum(
                1 for b in bookings_by_slot.get(s.id, []) if b.status in ("pending", "confirmed", "used")
            )

    # Effective per-guest limits for this day (override > global default).
    settings = get_or_create_settings(db)
    override = steam_day_overrides.get(db, day)
    limits = {
        "steam": {
            "effective": steam_day_overrides.effective_limit(
                override, "steam",
                default_steam=settings.max_bookings_per_guest,
                default_massage=settings.max_massage_bookings_per_guest,
            ),
            "default": settings.max_bookings_per_guest,
            "override": override.max_steam_per_guest if override else None,
        },
        "massage": {
            "effective": steam_day_overrides.effective_limit(
                override, "massage",
                default_steam=settings.max_bookings_per_guest,
                default_massage=settings.max_massage_bookings_per_guest,
            ),
            "default": settings.max_massage_bookings_per_guest,
            "override": override.max_massage_per_guest if override else None,
        },
        "note": override.note if override else None,
    }

    return {
        "date": day.isoformat(),
        "stats": by_service,
        "slots": [serialize_slot(s) for s in slots],
        "limits": limits,
    }


@router.get("/admin/cron-status")
def admin_cron_status(
    _admin=Depends(require_admin),
    db: Session = Depends(get_db),
):
    """Freshness signal for the daily materialize and per-minute expire tick.
    Returns the most recent event of each type plus its properties. Empty → cron
    hasn't run since deployment (or events were pruned)."""
    def _latest(event_type: str) -> Optional[dict]:
        row = (
            db.query(SteamEvent)
            .filter(SteamEvent.event_type == event_type)
            .order_by(SteamEvent.created_at.desc())
            .first()
        )
        if not row:
            return None
        return {
            "at": row.created_at.isoformat() if row.created_at else None,
            "properties": row.properties or {},
        }

    return {
        "materialize": _latest("materialization_run"),
        "expire": _latest("expire_run"),
    }


@router.post("/admin/walkin", response_model=BookingAdminRead, status_code=201)
def admin_create_walkin(
    payload: WalkinCreateRequest,
    _admin=Depends(require_admin),
    db: Session = Depends(get_db),
):
    """Staff books a walk-in guest into a slot. Skips email lifecycle entirely —
    booking is created `confirmed`. See `bookings_svc.create_walkin` for details."""
    booking = bookings_svc.create_walkin(
        db, slot_id=payload.slot_id, name=payload.name, email=payload.email,
    )
    slot = db.query(SteamSlot).filter(SteamSlot.id == booking.slot_id).first()
    return BookingAdminRead(
        id=booking.id,
        code=booking.code,
        service_type=booking.service_type,
        slot_id=booking.slot_id,
        slot_starts_at=slot.starts_at if slot else None,
        guest_email=booking.guest_email,
        guest_name=booking.guest_name,
        device_fingerprint=None,
        status=booking.status,
        qr_token=booking.qr_token,
        cancel_token=booking.cancel_token,
        ip=None,
        user_agent=None,
        created_at=booking.created_at,
        confirmed_at=booking.confirmed_at,
        cancelled_at=None,
        entered_at=None,
    )


@router.post("/admin/bookings/{booking_id}/cancel", response_model=BookingCancelResponse)
def admin_cancel_booking(
    booking_id: UUID,
    background: BackgroundTasks,
    _admin=Depends(require_admin),
    db: Session = Depends(get_db),
):
    booking = bookings_svc.cancel_by_id(db, booking_id, actor="admin")
    background.add_task(_send_cancellation_in_bg, booking.id)
    return BookingCancelResponse(
        id=booking.id,
        code=booking.code,
        status=booking.status,
        cancelled_at=booking.cancelled_at,
    )


# ---------------------------------------------------------------------------
# Webhook — Resend delivery events
# ---------------------------------------------------------------------------

@router.post("/webhooks/resend")
async def resend_webhook(request: Request, db: Session = Depends(get_db)):
    """Resend delivery webhook. Headers signed via Svix. Without RESEND_WEBHOOK_SECRET
    set we still accept (and just trust) — useful for early dev before the secret is
    wired up in Resend dashboard. Once the secret is set, we verify."""
    body = await request.body()
    secret = os.getenv("RESEND_WEBHOOK_SECRET")
    if not secret:
        # Hard refuse rather than silently accept anything — without signature
        # verification a public POST could spoof "email.delivered" to flip every
        # pending booking to confirmed. Set RESEND_WEBHOOK_SECRET in .secrets.env
        # alongside the value from Resend dashboard.
        raise HTTPException(
            status_code=503,
            detail={"error": "webhook_disabled", "reason": "RESEND_WEBHOOK_SECRET not configured"},
        )
    try:
        from svix.webhooks import Webhook  # imported lazily so missing dep doesn't break startup
        Webhook(secret).verify(body, dict(request.headers))
    except Exception as e:
        steam_events.log_event(
            db,
            "rate_limit_hit",
            properties={"webhook": "resend", "reason": "signature_invalid", "error": str(e)},
        )
        db.commit()
        raise HTTPException(status_code=401, detail={"error": "invalid_signature"})

    try:
        payload = json.loads(body.decode("utf-8") or "{}")
    except Exception:
        raise HTTPException(status_code=400, detail={"error": "invalid_json"})

    event_type = payload.get("type", "")
    data = payload.get("data", {}) or {}
    to_field = data.get("to")
    if isinstance(to_field, list) and to_field:
        to_email = to_field[0]
    elif isinstance(to_field, str):
        to_email = to_field
    else:
        to_email = ""

    if not to_email:
        steam_events.log_event(
            db,
            "rate_limit_hit",  # placeholder bucket for "received-but-unactionable"
            properties={"webhook": "resend", "reason": "no_to", "event_type": event_type},
        )
        db.commit()
        return {"ok": True, "ignored": "no_recipient"}

    result = bookings_svc.webhook_resend_event(db, event_type=event_type, to_email=to_email)
    return {"ok": True, **result}
