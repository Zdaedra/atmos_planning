"""Resend email channel. Jinja2 + premailer + httpx POST to https://api.resend.com.

Design choices:
- No official Resend SDK. One POST is one POST; the SDK is just a thin wrapper that
  would add a dep update path we don't need.
- Jinja2 templates live in `app/emails/steam/*.html`, with `_base.html` as wrapper.
- premailer inlines CSS for Outlook/Apple Mail compatibility.
- QR codes are inlined as base64 data URIs (~3kB each — Resend handles that fine).
- This module is silently disabled until `steam_settings.resend_from_email` is set.
  All callers can fire-and-forget; if the channel is off, this returns False and logs.

Env requirements (set in /root/atmos_planning/.secrets.env):
  RESEND_API_KEY        — required to send anything
  RESEND_WEBHOOK_SECRET — required only for /webhooks/resend signature verify
"""
import logging
import os
from pathlib import Path
from typing import Optional
from uuid import UUID

import httpx
from jinja2 import Environment, FileSystemLoader, select_autoescape
from premailer import transform
from sqlalchemy.orm import Session

from app.core.time_utils import BALI_TZ, to_bali
from app.models.steam import SteamBooking, SteamSettings, SteamSlot
from app.services import steam_events, steam_qr
from app.services.steam_settings import get_or_create_settings

logger = logging.getLogger(__name__)

RESEND_API_URL = "https://api.resend.com/emails"
RESEND_API_KEY = os.getenv("RESEND_API_KEY")

_TEMPLATES_DIR = Path(__file__).resolve().parent.parent / "emails"
_jinja = Environment(
    loader=FileSystemLoader(str(_TEMPLATES_DIR)),
    autoescape=select_autoescape(["html"]),
)


def _is_enabled(settings: SteamSettings) -> bool:
    """True iff we have both an API key and a from-address configured.
    Either missing → silently skip (logged once)."""
    if not RESEND_API_KEY:
        return False
    if not (settings.resend_from_email or "").strip():
        return False
    return True


def _render(template_name: str, **context) -> str:
    tpl = _jinja.get_template(f"steam/{template_name}")
    raw = tpl.render(**context)
    return transform(raw, keep_style_tags=False, remove_classes=False)


def _format_booking_context(booking: SteamBooking, slot: SteamSlot, settings: SteamSettings) -> dict:
    """Common per-booking variables used by booking_confirmation and resend_bookings."""
    starts = to_bali(slot.starts_at)
    cancel_url_base = (settings.public_url or "").rstrip("/")
    cancel_url = f"{cancel_url_base}/cancel/{booking.cancel_token}" if cancel_url_base else "#"
    return {
        "code": booking.code,
        "service_type": booking.service_type,
        "weekday": starts.strftime("%A"),
        "date_human": starts.strftime("%B %-d, %Y"),
        "time_human": starts.strftime("%-I:%M %p"),
        "therapist": slot.therapist,
        "room": slot.room,
        "variant": slot.variant,
        "qr_data_uri": steam_qr.render_data_uri(str(booking.qr_token)),
        "cancel_url": cancel_url,
    }


def _send(
    settings: SteamSettings,
    to: str,
    subject: str,
    html: str,
) -> Optional[str]:
    """Low-level send. Returns Resend message id on success, None on skip/failure.
    Raises only on programming errors — network errors are caught and logged."""
    if not _is_enabled(settings):
        logger.info("[steam_email] skipped (resend not configured): to=%s subject=%r", to, subject)
        return None
    payload = {
        "from": settings.resend_from_email,
        "to": [to],
        "subject": subject,
        "html": html,
    }
    if (settings.resend_reply_to or "").strip():
        payload["reply_to"] = settings.resend_reply_to
    try:
        resp = httpx.post(
            RESEND_API_URL,
            headers={"Authorization": f"Bearer {RESEND_API_KEY}"},
            json=payload,
            timeout=10.0,
        )
        resp.raise_for_status()
        return resp.json().get("id")
    except Exception as e:
        logger.exception("[steam_email] resend POST failed: %s", e)
        return None


# -----------------------------------------------------------------------------
# Public senders (one per template)
# -----------------------------------------------------------------------------

def send_booking_confirmation(db: Session, booking_ids: list[UUID]) -> Optional[str]:
    """One email per multi-slot booking transaction. Includes one QR per booking inline.
    Returns Resend message_id (or None if skipped/failed)."""
    settings = get_or_create_settings(db)
    bookings = (
        db.query(SteamBooking)
        .filter(SteamBooking.id.in_(booking_ids))
        .order_by(SteamBooking.created_at.asc())
        .all()
    )
    if not bookings:
        return None
    slots_by_id = {
        s.id: s
        for s in db.query(SteamSlot).filter(SteamSlot.id.in_([b.slot_id for b in bookings])).all()
    }
    to = bookings[0].guest_email

    items = [_format_booking_context(b, slots_by_id[b.slot_id], settings) for b in bookings]
    first = items[0]
    subject = f"Your {'sessions are' if len(items) > 1 else 'session is'} confirmed — {first['weekday']}, {first['date_human']} {first['time_human']}"

    html = _render(
        "booking_confirmation.html",
        subject=subject,
        bookings=items,
        multiple=len(items) > 1,
        festival_name=settings.festival_name,
        location_name=settings.location_name,
        qr_valid_before_slot_minutes=settings.qr_valid_before_slot_minutes,
    )
    message_id = _send(settings, to=to, subject=subject, html=html)
    for b in bookings:
        steam_events.log_event(
            db,
            "email_sent" if message_id else "email_failed",
            properties={"template": "booking_confirmation", "resend_id": message_id},
            booking_id=b.id,
        )
    db.commit()
    return message_id


def send_cancellation(db: Session, booking_id: UUID) -> Optional[str]:
    settings = get_or_create_settings(db)
    booking = db.query(SteamBooking).filter(SteamBooking.id == booking_id).first()
    if not booking:
        return None
    slot = db.query(SteamSlot).filter(SteamSlot.id == booking.slot_id).first()
    if not slot:
        return None
    ctx = _format_booking_context(booking, slot, settings)
    subject = "Booking cancelled"
    html = _render(
        "cancellation.html",
        subject=subject,
        festival_name=settings.festival_name,
        public_url=settings.public_url,
        **ctx,
    )
    message_id = _send(settings, to=booking.guest_email, subject=subject, html=html)
    steam_events.log_event(
        db,
        "email_sent" if message_id else "email_failed",
        properties={"template": "cancellation", "resend_id": message_id},
        booking_id=booking.id,
    )
    db.commit()
    return message_id


def send_resend_bookings(db: Session, email: str) -> Optional[str]:
    """`Resend email` button on success page: gather every active booking for this
    email and put them all in one message. Returns None if no active bookings."""
    settings = get_or_create_settings(db)
    email_norm = email.strip().lower()
    bookings = (
        db.query(SteamBooking)
        .filter(
            SteamBooking.guest_email == email_norm,
            SteamBooking.status.in_(("pending", "confirmed", "used")),
        )
        .order_by(SteamBooking.created_at.asc())
        .all()
    )
    if not bookings:
        # We still send a friendly "no bookings" body — it's confusing to be silent.
        html = _render(
            "resend_bookings.html",
            subject="Your active bookings",
            bookings=[],
            festival_name=settings.festival_name,
        )
        return _send(settings, to=email_norm, subject="Your active bookings", html=html)

    slots_by_id = {
        s.id: s
        for s in db.query(SteamSlot).filter(SteamSlot.id.in_([b.slot_id for b in bookings])).all()
    }
    items = [_format_booking_context(b, slots_by_id[b.slot_id], settings) for b in bookings]
    subject = "Your active bookings"
    html = _render(
        "resend_bookings.html",
        subject=subject,
        bookings=items,
        festival_name=settings.festival_name,
    )
    message_id = _send(settings, to=email_norm, subject=subject, html=html)
    steam_events.log_event(
        db,
        "resend_requested",
        properties={"booking_count": len(items), "resend_id": message_id},
    )
    db.commit()
    return message_id


def send_slot_changed(
    db: Session,
    booking_id: UUID,
    old_slot: SteamSlot,
    new_slot: SteamSlot,
) -> Optional[str]:
    settings = get_or_create_settings(db)
    booking = db.query(SteamBooking).filter(SteamBooking.id == booking_id).first()
    if not booking:
        return None
    old_starts = to_bali(old_slot.starts_at)
    new_starts = to_bali(new_slot.starts_at)
    cancel_url_base = (settings.public_url or "").rstrip("/")
    cancel_url = f"{cancel_url_base}/cancel/{booking.cancel_token}" if cancel_url_base else "#"
    subject = "Your steam session time has changed"
    html = _render(
        "slot_changed.html",
        subject=subject,
        festival_name=settings.festival_name,
        code=booking.code,
        cancel_url=cancel_url,
        old_weekday=old_starts.strftime("%A"),
        old_date_human=old_starts.strftime("%B %-d, %Y"),
        old_time_human=old_starts.strftime("%-I:%M %p"),
        new_weekday=new_starts.strftime("%A"),
        new_date_human=new_starts.strftime("%B %-d, %Y"),
        new_time_human=new_starts.strftime("%-I:%M %p"),
    )
    message_id = _send(settings, to=booking.guest_email, subject=subject, html=html)
    steam_events.log_event(
        db,
        "email_sent" if message_id else "email_failed",
        properties={"template": "slot_changed", "resend_id": message_id},
        booking_id=booking.id,
    )
    db.commit()
    return message_id


def send_staff_magic_link(db: Session, *, name: str, to: str, activation_url: str) -> Optional[str]:
    settings = get_or_create_settings(db)
    subject = "Your Atmos Steam staff access"
    html = _render(
        "staff_magic_link.html",
        subject=subject,
        festival_name=settings.festival_name,
        name=name,
        activation_url=activation_url,
    )
    return _send(settings, to=to, subject=subject, html=html)
