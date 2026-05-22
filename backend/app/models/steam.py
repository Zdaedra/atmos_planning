from uuid import uuid4

from sqlalchemy import (
    Column, Integer, String, Boolean, DateTime, ForeignKey, Text, Date, Time,
    CheckConstraint, Index, text,
)
from sqlalchemy.dialects.postgresql import UUID, ARRAY, INET, JSONB
from sqlalchemy.sql import func

from app.core.database import Base


class SteamSettings(Base):
    """Single-row config (id=1). Holds all guest-facing knobs the manager edits in UI.

    Note on naming: this table — and the rest of the steam_* family — was named when
    the module only handled steam sessions. It now stores every service_type (steam,
    massage, …). Renaming would churn prod migrations for cosmetic gain, so we keep
    the historical prefix and document the broader scope here instead.
    """
    __tablename__ = "steam_settings"
    __table_args__ = (
        CheckConstraint("id = 1", name="steam_settings_singleton"),
    )

    id = Column(Integer, primary_key=True, default=1)
    # max_bookings_per_guest = limit for service_type='steam' (legacy column name)
    max_bookings_per_guest = Column(Integer, nullable=False, default=2)
    max_massage_bookings_per_guest = Column(Integer, nullable=False, default=5)
    booking_window_minutes = Column(Integer, nullable=False, default=20)
    qr_valid_before_slot_minutes = Column(Integer, nullable=False, default=10)
    materialization_horizon_weeks = Column(Integer, nullable=False, default=8)
    festival_name = Column(String, nullable=False, default="Atmos Steam Club")
    location_name = Column(String, nullable=False, default="Main Banya")
    resend_from_email = Column(String, nullable=True)
    resend_reply_to = Column(String, nullable=True)
    public_url = Column(String, nullable=True)
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())


class SteamSlotTemplate(Base):
    """Recurring schedule rule. Real slots are materialized from this into steam_slots.

    service_type is set at template level and copied into every generated slot.
    therapist/room/variant are optional metadata for massage-style services
    (NULL for steam sessions in 99% of cases)."""
    __tablename__ = "steam_slot_templates"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid4)
    name = Column(String, nullable=True)
    service_type = Column(String, nullable=False, default="steam")  # steam|massage
    days_of_week = Column(ARRAY(Integer), nullable=False)  # ISO 1=Mon..7=Sun
    start_time = Column(Time, nullable=False)
    duration_minutes = Column(Integer, nullable=False)
    capacity = Column(Integer, nullable=False)
    starts_on = Column(Date, nullable=False)
    repeats_until = Column(Date, nullable=True)
    status = Column(String, nullable=False, default="active")  # active|paused
    therapist = Column(String, nullable=True)  # for massage: practitioner name
    room = Column(String, nullable=True)  # for massage: room / station
    variant = Column(String, nullable=True)  # for massage: "deep tissue", "swedish", etc.
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    __table_args__ = (
        CheckConstraint("status IN ('active','paused')", name="steam_slot_templates_status_chk"),
        CheckConstraint("duration_minutes > 0", name="steam_slot_templates_duration_chk"),
        CheckConstraint("capacity > 0", name="steam_slot_templates_capacity_chk"),
        CheckConstraint("service_type IN ('steam','massage')", name="steam_slot_templates_service_chk"),
    )


class SteamSlot(Base):
    """A concrete bookable time window. Either standalone (template_id null) or materialized
    from a template. is_override means the manager edited this specific instance, so
    subsequent template re-materializations must leave it alone.
    status='closed' is a tombstone for cancelled days — also pins it against re-creation.
    """
    __tablename__ = "steam_slots"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid4)
    service_type = Column(String, nullable=False, default="steam")  # steam|massage
    starts_at = Column(DateTime(timezone=True), nullable=False)
    ends_at = Column(DateTime(timezone=True), nullable=False)
    capacity = Column(Integer, nullable=False)
    booked_count = Column(Integer, nullable=False, default=0)
    template_id = Column(UUID(as_uuid=True), ForeignKey("steam_slot_templates.id"), nullable=True)
    is_override = Column(Boolean, nullable=False, default=False)
    status = Column(String, nullable=False, default="open")  # open|closed
    therapist = Column(String, nullable=True)
    room = Column(String, nullable=True)
    variant = Column(String, nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    __table_args__ = (
        CheckConstraint("status IN ('open','closed')", name="steam_slots_status_chk"),
        CheckConstraint("capacity > 0", name="steam_slots_capacity_chk"),
        CheckConstraint("booked_count >= 0 AND booked_count <= capacity", name="steam_slots_booked_count_chk"),
        CheckConstraint("ends_at > starts_at", name="steam_slots_time_order_chk"),
        CheckConstraint("service_type IN ('steam','massage')", name="steam_slots_service_chk"),
        Index("ix_steam_slots_starts_at", "starts_at"),
        Index("ix_steam_slots_template_starts", "template_id", "starts_at"),
        Index("ix_steam_slots_service_starts", "service_type", "starts_at"),
        Index(
            "ix_steam_slots_open_future",
            "starts_at",
            postgresql_where=text("status = 'open'"),
        ),
    )


class SteamBooking(Base):
    """A guest's claim on a slot.

    Lifecycle:
      pending   — created, waiting for email-delivery webhook (Phase 3+ only)
      confirmed — email delivered; or, in Phase 2 with no Resend wired, set directly on insert
      cancelled — guest or admin cancelled before slot start
      expired   — pending too long, or slot.starts_at passed without check-in
      used      — staff scanner verified entry (Phase 4)
    """
    __tablename__ = "steam_bookings"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid4)
    code = Column(String, nullable=False, unique=True)  # ATM-XXXXX
    service_type = Column(String, nullable=False, default="steam")  # steam|massage; denormalized from slot for fast per-service limit checks
    slot_id = Column(UUID(as_uuid=True), ForeignKey("steam_slots.id"), nullable=False)
    guest_email = Column(String, nullable=False)  # stored lowercased
    guest_name = Column(String, nullable=True)
    device_fingerprint = Column(String, nullable=True)
    status = Column(String, nullable=False, default="confirmed")  # pending|confirmed|cancelled|expired|used
    qr_token = Column(UUID(as_uuid=True), nullable=False, unique=True, default=uuid4)
    cancel_token = Column(UUID(as_uuid=True), nullable=False, unique=True, default=uuid4)
    ip = Column(INET, nullable=True)
    user_agent = Column(Text, nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    confirmed_at = Column(DateTime(timezone=True), nullable=True)
    cancelled_at = Column(DateTime(timezone=True), nullable=True)
    entered_at = Column(DateTime(timezone=True), nullable=True)

    __table_args__ = (
        CheckConstraint(
            "status IN ('pending','confirmed','cancelled','expired','used')",
            name="steam_bookings_status_chk",
        ),
        CheckConstraint("service_type IN ('steam','massage')", name="steam_bookings_service_chk"),
        Index("ix_steam_bookings_email", "guest_email"),
        Index("ix_steam_bookings_fingerprint", "device_fingerprint"),
        Index("ix_steam_bookings_slot_status", "slot_id", "status"),
        Index("ix_steam_bookings_qr_token", "qr_token"),
        Index("ix_steam_bookings_cancel_token", "cancel_token"),
        Index("ix_steam_bookings_status_created", "status", "created_at"),
        Index("ix_steam_bookings_service_status", "service_type", "status"),
    )


class SteamStaff(Base):
    """Door host / scanner operator. Separate from `users` because their lifecycle
    is completely different — magic-link activation, 24h session, no password —
    and we don't want to overload role-checks across the rest of the app.
    """
    __tablename__ = "steam_staff"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid4)
    name = Column(String, nullable=False)
    activation_token = Column(String, nullable=True, unique=True)
    session_token = Column(String, nullable=True, unique=True)
    session_expires_at = Column(DateTime(timezone=True), nullable=True)
    last_seen_at = Column(DateTime(timezone=True), nullable=True)
    status = Column(String, nullable=False, default="active")  # active|inactive
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    __table_args__ = (
        CheckConstraint("status IN ('active','inactive')", name="steam_staff_status_chk"),
        Index("ix_steam_staff_activation_token", "activation_token"),
        Index("ix_steam_staff_session_token", "session_token"),
    )


class SteamEvent(Base):
    """Analytics ledger. Append-only. Each meaningful action (guest/staff/admin/system)
    writes one row. No reads from product code — read by future analytics dashboard.
    """
    __tablename__ = "steam_events"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid4)
    event_type = Column(String, nullable=False)
    properties = Column(JSONB, nullable=False, server_default=text("'{}'::jsonb"))
    device_fingerprint = Column(String, nullable=True)
    booking_id = Column(UUID(as_uuid=True), nullable=True)  # no FK — events outlive bookings
    slot_id = Column(UUID(as_uuid=True), nullable=True)
    staff_id = Column(UUID(as_uuid=True), nullable=True)
    ip = Column(INET, nullable=True)
    user_agent = Column(Text, nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    __table_args__ = (
        Index("ix_steam_events_type_created", "event_type", "created_at"),
        Index("ix_steam_events_booking", "booking_id"),
        Index("ix_steam_events_slot", "slot_id"),
    )
