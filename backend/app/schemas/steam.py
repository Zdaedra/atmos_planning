from datetime import datetime, date, time
from typing import Optional, List
from uuid import UUID

from pydantic import BaseModel, EmailStr, Field, field_validator


# ---------------------------------------------------------------------------
# Settings
# ---------------------------------------------------------------------------

SERVICE_TYPES = ("steam", "massage")


class SteamSettingsRead(BaseModel):
    max_bookings_per_guest: int  # steam-service limit (legacy column name)
    max_massage_bookings_per_guest: int
    booking_window_minutes: int
    qr_valid_before_slot_minutes: int
    materialization_horizon_weeks: int
    festival_name: str
    location_name: str
    resend_from_email: Optional[str] = None
    resend_reply_to: Optional[str] = None
    public_url: Optional[str] = None
    updated_at: datetime

    class Config:
        from_attributes = True


class SteamSettingsUpdate(BaseModel):
    max_bookings_per_guest: Optional[int] = Field(default=None, ge=1, le=20)
    max_massage_bookings_per_guest: Optional[int] = Field(default=None, ge=1, le=50)
    booking_window_minutes: Optional[int] = Field(default=None, ge=1, le=240)
    qr_valid_before_slot_minutes: Optional[int] = Field(default=None, ge=0, le=240)
    materialization_horizon_weeks: Optional[int] = Field(default=None, ge=1, le=52)
    festival_name: Optional[str] = None
    location_name: Optional[str] = None
    resend_from_email: Optional[str] = None
    resend_reply_to: Optional[str] = None
    public_url: Optional[str] = None


# ---------------------------------------------------------------------------
# Slot templates
# ---------------------------------------------------------------------------

_DAY_RANGE = set(range(1, 8))  # ISO 1=Mon..7=Sun


def _normalize_days(v: List[int]) -> List[int]:
    """Validate + dedupe + sort. Raises ValueError on bad input."""
    if not v:
        raise ValueError("days_of_week must not be empty")
    bad = [d for d in v if d not in _DAY_RANGE]
    if bad:
        raise ValueError(f"days_of_week values must be in 1..7 (ISO weekday); got {bad}")
    return sorted(set(v))


class SteamSlotTemplateBase(BaseModel):
    name: Optional[str] = None
    service_type: str = "steam"  # steam|massage
    days_of_week: List[int]
    start_time: time
    duration_minutes: int = Field(ge=1, le=24 * 60)
    capacity: int = Field(ge=1, le=1000)
    starts_on: date
    repeats_until: Optional[date] = None
    therapist: Optional[str] = None
    room: Optional[str] = None
    variant: Optional[str] = None

    @field_validator("days_of_week")
    @classmethod
    def _validate_days(cls, v: List[int]) -> List[int]:
        return _normalize_days(v)

    @field_validator("service_type")
    @classmethod
    def _validate_service(cls, v: str) -> str:
        if v not in SERVICE_TYPES:
            raise ValueError(f"service_type must be one of {SERVICE_TYPES}")
        return v


class SteamSlotTemplateCreate(SteamSlotTemplateBase):
    pass


class SteamSlotTemplateUpdate(BaseModel):
    """All fields optional — PATCH semantics. service_type is intentionally
    NOT here: changing the kind of an existing template would invalidate every
    materialized slot under it. To switch types, delete + recreate."""
    name: Optional[str] = None
    days_of_week: Optional[List[int]] = None
    start_time: Optional[time] = None
    duration_minutes: Optional[int] = Field(default=None, ge=1, le=24 * 60)
    capacity: Optional[int] = Field(default=None, ge=1, le=1000)
    starts_on: Optional[date] = None
    repeats_until: Optional[date] = None
    status: Optional[str] = None  # active|paused
    therapist: Optional[str] = None
    room: Optional[str] = None
    variant: Optional[str] = None
    apply_mode: Optional[str] = Field(default=None, description="unbooked_only|notify_all (booking-aware edit)")

    @field_validator("days_of_week")
    @classmethod
    def _validate_days(cls, v: Optional[List[int]]) -> Optional[List[int]]:
        if v is None:
            return None
        return _normalize_days(v)


class SteamSlotTemplateRead(SteamSlotTemplateBase):
    id: UUID
    status: str
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


class SteamSlotTemplatePreviewRequest(BaseModel):
    """Compute first N dates a template would materialize, without saving."""
    days_of_week: List[int]
    starts_on: date
    repeats_until: Optional[date] = None
    limit: int = Field(default=5, ge=1, le=50)

    @field_validator("days_of_week")
    @classmethod
    def _validate_days(cls, v: List[int]) -> List[int]:
        return _normalize_days(v)


class SteamSlotTemplatePreviewResponse(BaseModel):
    dates: List[date]


# ---------------------------------------------------------------------------
# Slots
# ---------------------------------------------------------------------------

class SteamSlotRead(BaseModel):
    id: UUID
    service_type: str
    starts_at: datetime
    ends_at: datetime
    capacity: int
    booked_count: int
    template_id: Optional[UUID] = None
    is_override: bool
    status: str
    therapist: Optional[str] = None
    room: Optional[str] = None
    variant: Optional[str] = None
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


class SteamSlotPublicRead(BaseModel):
    """Subset returned to guest UI — no admin fields, no internal counters that don't matter."""
    id: UUID
    service_type: str
    starts_at: datetime
    ends_at: datetime
    capacity: int
    booked_count: int
    therapist: Optional[str] = None
    variant: Optional[str] = None

    class Config:
        from_attributes = True


class SteamSlotCreate(BaseModel):
    service_type: str = "steam"
    starts_at: datetime
    ends_at: datetime
    capacity: int = Field(ge=1, le=1000)
    therapist: Optional[str] = None
    room: Optional[str] = None
    variant: Optional[str] = None

    @field_validator("service_type")
    @classmethod
    def _validate_service(cls, v: str) -> str:
        if v not in SERVICE_TYPES:
            raise ValueError(f"service_type must be one of {SERVICE_TYPES}")
        return v


class SteamSlotUpdate(BaseModel):
    starts_at: Optional[datetime] = None
    ends_at: Optional[datetime] = None
    capacity: Optional[int] = Field(default=None, ge=1, le=1000)
    status: Optional[str] = None  # open|closed
    therapist: Optional[str] = None
    room: Optional[str] = None
    variant: Optional[str] = None
    # service_type intentionally omitted: same reasoning as SteamSlotTemplateUpdate.


# ---------------------------------------------------------------------------
# Materialize
# ---------------------------------------------------------------------------

class MaterializeResult(BaseModel):
    templates_processed: int
    created: int
    skipped: int
    paused: int


# ---------------------------------------------------------------------------
# Bookings
# ---------------------------------------------------------------------------

class BookingCreate(BaseModel):
    """Public payload from guest UI. `slot_ids` allows reserving several slots in one
    transaction; the system enforces max_bookings_per_guest across them combined with
    any active bookings the guest already has under the same email/fingerprint."""
    slot_ids: List[UUID] = Field(min_length=1, max_length=20)
    email: EmailStr
    name: Optional[str] = None
    fingerprint: Optional[str] = None  # null when JS blocked / FingerprintJS unavailable


class BookingPublicRead(BaseModel):
    """Subset returned to guest after booking: enough to render success screen."""
    id: UUID
    code: str
    service_type: str
    slot_id: UUID
    slot_starts_at: datetime
    slot_ends_at: datetime
    status: str
    qr_token: UUID
    cancel_token: UUID
    guest_email: str
    created_at: datetime


class BookingsCreateResponse(BaseModel):
    """One POST /bookings creates one or more rows (one per slot_id)."""
    bookings: List[BookingPublicRead]


class BookingByCodeRead(BaseModel):
    """GET /bookings/by-code/{code} — what success page needs to render QR + slot info."""
    id: UUID
    code: str
    service_type: str
    status: str
    slot_id: UUID
    slot_starts_at: datetime
    slot_ends_at: datetime
    qr_token: UUID
    guest_email: str


class BookingCancelRequest(BaseModel):
    cancel_token: UUID


class BookingResendRequest(BaseModel):
    email: EmailStr


class BookingCancelResponse(BaseModel):
    id: UUID
    code: str
    status: str
    cancelled_at: datetime


class BookingAdminRead(BaseModel):
    """Full row for admin Bookings table."""
    id: UUID
    code: str
    service_type: str
    slot_id: UUID
    slot_starts_at: Optional[datetime] = None
    guest_email: str
    guest_name: Optional[str] = None
    device_fingerprint: Optional[str] = None
    status: str
    qr_token: UUID
    cancel_token: UUID
    ip: Optional[str] = None
    user_agent: Optional[str] = None
    created_at: datetime
    confirmed_at: Optional[datetime] = None
    cancelled_at: Optional[datetime] = None
    entered_at: Optional[datetime] = None


class ExpireResult(BaseModel):
    pending_expired: int
    confirmed_expired: int


# ---------------------------------------------------------------------------
# Staff (door scanner) + QR verify
# ---------------------------------------------------------------------------

class StaffCreate(BaseModel):
    name: str = Field(min_length=1, max_length=120)


class StaffAdminRead(BaseModel):
    id: UUID
    name: str
    status: str
    has_active_session: bool
    last_seen_at: Optional[datetime] = None
    activation_token: Optional[str] = None  # only set on create/reissue
    activation_url: Optional[str] = None
    created_at: datetime


class StaffActivateResponse(BaseModel):
    id: UUID
    name: str
    session_token: str
    session_expires_at: datetime


class StaffVerifyRequest(BaseModel):
    qr_token: UUID


class StaffVerifyResponse(BaseModel):
    """Result enum:
      valid            — entry allowed; booking moves to 'used'
      wrong_time       — outside the [starts_at - qr_valid_before, starts_at] window;
                         `reason` says 'too_early' or 'too_late'
      already_used     — booking was already scanned (entered_at set)
      cancelled        — booking was cancelled
      expired          — booking expired (no-show or never confirmed)
      not_found        — qr_token not in our DB
    """
    result: str
    reason: Optional[str] = None
    code: Optional[str] = None
    service_type: Optional[str] = None
    slot_starts_at: Optional[datetime] = None
    slot_ends_at: Optional[datetime] = None
    therapist: Optional[str] = None
    room: Optional[str] = None
    variant: Optional[str] = None
    guest_email: Optional[str] = None
    entered_at: Optional[datetime] = None
    entry_opens_at: Optional[datetime] = None  # only set on wrong_time:too_early


class CleanupResult(BaseModel):
    cleared: int
