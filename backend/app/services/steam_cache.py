"""5-second LRU-ish cache for GET /steam/slots.

Rationale: the slot-listing endpoint is the hottest one — every guest hits it before
the booking page renders. A 5s TTL maps to 0-1 DB query per IP per page-load, while
keeping the "filled up" signal fresh enough that a guest doesn't pick a stale slot.
Cache is single-process; if we scale workers, move to Redis.

Invalidation: every booking/cancel/slot-edit/template-edit calls `invalidate()`.
We don't try clever range-based invalidation — clearing everything is cheap.
"""
import time
from threading import Lock
from typing import Any, Optional

_TTL_SECONDS = 5

_store: dict[Any, tuple[float, Any]] = {}
_lock = Lock()


def get(key: Any) -> Optional[Any]:
    """Returns the cached value if fresh, else None."""
    now = time.time()
    with _lock:
        entry = _store.get(key)
        if entry is None:
            return None
        expires_at, value = entry
        if expires_at <= now:
            _store.pop(key, None)
            return None
        return value


def set(key: Any, value: Any, ttl_seconds: int = _TTL_SECONDS) -> None:
    with _lock:
        _store[key] = (time.time() + ttl_seconds, value)


def invalidate() -> None:
    """Drop everything. Called on any mutation that could change /slots output."""
    with _lock:
        _store.clear()
