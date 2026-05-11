from datetime import datetime, timezone
from zoneinfo import ZoneInfo

BALI_TZ = ZoneInfo("Asia/Makassar")

def get_now() -> datetime:
    return datetime.now(BALI_TZ)

def get_today_start() -> datetime:
    now = get_now()
    return datetime(now.year, now.month, now.day, 0, 0, tzinfo=BALI_TZ)

def to_bali(dt: datetime) -> datetime:
    if dt is None:
        return None
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=BALI_TZ)
    return dt.astimezone(BALI_TZ)
