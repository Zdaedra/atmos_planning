"""In-memory rate limiter (sliding-window counter per key).

Sized for one FastAPI worker. If we ever scale to >1 worker, this needs Redis —
contains a TODO marker. For Phase 2 / festival pilot, one worker is enough.

Buckets are auto-pruned lazily on each check (no background thread).
"""
import time
from threading import Lock
from typing import Optional

from fastapi import HTTPException, Request

# bucket_key -> list of timestamps (seconds, float)
_buckets: dict[str, list[float]] = {}
_lock = Lock()


def _prune(timestamps: list[float], cutoff: float) -> list[float]:
    """Return only timestamps newer than cutoff. Caller assigns the result back."""
    return [t for t in timestamps if t > cutoff]


def hit(key: str, max_requests: int, window_seconds: int) -> tuple[bool, int]:
    """Try to consume one slot for `key`. Returns (allowed, retry_after_seconds).
    retry_after is 0 when allowed.
    """
    now = time.time()
    cutoff = now - window_seconds
    with _lock:
        timestamps = _buckets.get(key, [])
        timestamps = _prune(timestamps, cutoff)
        if len(timestamps) >= max_requests:
            # oldest still-in-window dictates earliest free slot
            retry_after = max(1, int(timestamps[0] + window_seconds - now + 1))
            _buckets[key] = timestamps
            return False, retry_after
        timestamps.append(now)
        _buckets[key] = timestamps
        return True, 0


def enforce(key: str, max_requests: int, window_seconds: int) -> None:
    """Raise 429 if rate exceeded. Convenience wrapper around hit()."""
    allowed, retry_after = hit(key, max_requests, window_seconds)
    if not allowed:
        raise HTTPException(
            status_code=429,
            detail={"error": "rate_limited", "retry_after_seconds": retry_after},
            headers={"Retry-After": str(retry_after)},
        )


def client_ip(request: Request) -> str:
    """Best-effort client IP. Trusts X-Forwarded-For first hop (Caddy is in front),
    falls back to socket peer. Used as part of rate-limit keys."""
    xff = request.headers.get("x-forwarded-for")
    if xff:
        return xff.split(",")[0].strip()
    return request.client.host if request.client else "unknown"


# ---- Predefined limits (see spec §9.2) -------------------------------------

def limit_create_booking(request: Request, fingerprint: Optional[str]) -> None:
    """5/min per IP, 10/hour per fingerprint."""
    ip = client_ip(request)
    enforce(f"book_create:ip:{ip}", max_requests=5, window_seconds=60)
    if fingerprint:
        enforce(f"book_create:fp:{fingerprint}", max_requests=10, window_seconds=3600)


def limit_list_slots(request: Request) -> None:
    """60/min per IP."""
    enforce(f"slots_list:ip:{client_ip(request)}", max_requests=60, window_seconds=60)


def limit_resend_email(email: str) -> None:
    """1/min per email."""
    enforce(f"book_resend:email:{email.lower()}", max_requests=1, window_seconds=60)
