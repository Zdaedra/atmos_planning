from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import text
import os

from app.api import auth, tasks, shifts, media, locations, dashboard, supervisors, stats, messages, ai, steam
from app.core.database import engine
from app.models.all import Base
from app.models import steam as _steam_models  # noqa: F401  — register tables with Base.metadata

app = FastAPI(title="Atmos Operations API")

# Auto-create missing tables for MVP
Base.metadata.create_all(bind=engine)

# Idempotent schema/index migrations. We're not on Alembic yet, but at least
# the steps are explicit and CREATE INDEX IF NOT EXISTS is safe to re-run.
_MIGRATIONS = [
    "ALTER TABLE task_templates ADD COLUMN IF NOT EXISTS default_assigned_user INTEGER REFERENCES users(id)",
    "ALTER TABLE task_templates ADD COLUMN IF NOT EXISTS repeat_interval_days INTEGER",
    "ALTER TABLE task_templates DROP COLUMN IF EXISTS overdue_alert_days",
    "CREATE TABLE IF NOT EXISTS app_settings (key VARCHAR PRIMARY KEY, value TEXT NOT NULL, updated_at TIMESTAMPTZ DEFAULT now())",
    # widen repeat_type allowlist to include 'mini'
    "ALTER TABLE task_templates DROP CONSTRAINT IF EXISTS task_templates_repeat_type_chk",
    "ALTER TABLE task_templates ADD CONSTRAINT task_templates_repeat_type_chk CHECK (repeat_type IN ('daily','weekly','biweekly','monthly','project','custom','mini'))",
    # department split: maintenance (legacy ops) / service (repairs).
    # NB: previously called "refreshments" — migrate any leftover rows.
    "ALTER TABLE task_templates ADD COLUMN IF NOT EXISTS department VARCHAR DEFAULT 'maintenance'",
    "UPDATE task_templates SET department='maintenance' WHERE department IS NULL",
    "UPDATE task_templates SET department='service' WHERE department='refreshments'",
    "ALTER TABLE task_templates ALTER COLUMN department SET NOT NULL",
    "ALTER TABLE task_templates DROP CONSTRAINT IF EXISTS task_templates_department_chk",
    "ALTER TABLE task_templates ADD CONSTRAINT task_templates_department_chk CHECK (department IN ('maintenance','service'))",
    "CREATE INDEX IF NOT EXISTS ix_task_templates_department ON task_templates (department)",
    # Service-task supply fields
    "ALTER TABLE task_templates ADD COLUMN IF NOT EXISTS supply TEXT",
    "ALTER TABLE task_templates ADD COLUMN IF NOT EXISTS supply_days_before INTEGER",
    # is_supply flag — auto-generated supply prep task spawned by service templates
    "ALTER TABLE tasks ADD COLUMN IF NOT EXISTS is_supply BOOLEAN DEFAULT FALSE",
    "UPDATE tasks SET is_supply = FALSE WHERE is_supply IS NULL",
    "ALTER TABLE tasks ALTER COLUMN is_supply SET NOT NULL",
    "CREATE INDEX IF NOT EXISTS ix_tasks_is_supply ON tasks (is_supply) WHERE is_supply = TRUE",
    "ALTER TABLE tasks ADD COLUMN IF NOT EXISTS ai_status VARCHAR DEFAULT 'pending'",
    "ALTER TABLE tasks ADD COLUMN IF NOT EXISTS ai_reasoning TEXT",
    "CREATE INDEX IF NOT EXISTS ix_tasks_scheduled_date ON tasks (scheduled_date)",
    "CREATE INDEX IF NOT EXISTS ix_tasks_assigned_user ON tasks (assigned_user)",
    "CREATE INDEX IF NOT EXISTS ix_tasks_template_id ON tasks (template_id)",
    "CREATE INDEX IF NOT EXISTS ix_tasks_status ON tasks (status)",
    "CREATE INDEX IF NOT EXISTS ix_task_templates_next_execution_date ON task_templates (next_execution_date)",
    "CREATE INDEX IF NOT EXISTS ix_task_photos_created_at ON task_photos (created_at)",
    "CREATE INDEX IF NOT EXISTS ix_task_photos_task_id ON task_photos (task_id)",
    "CREATE INDEX IF NOT EXISTS ix_task_comments_task_id ON task_comments (task_id)",
    "CREATE INDEX IF NOT EXISTS ix_shifts_user_id ON shifts (user_id)",
    "CREATE INDEX IF NOT EXISTS ix_shifts_start_time ON shifts (start_time)",
    # ---- Steam booking module: multi-service support (steam + massage + …) ----
    # Tables keep the steam_* prefix as a historical naming choice — the data inside
    # now covers every service_type, not just steam. Renaming would break running prod.
    "ALTER TABLE steam_settings ADD COLUMN IF NOT EXISTS max_massage_bookings_per_guest INTEGER NOT NULL DEFAULT 5",
    "ALTER TABLE steam_slot_templates ADD COLUMN IF NOT EXISTS service_type VARCHAR NOT NULL DEFAULT 'steam'",
    "ALTER TABLE steam_slot_templates ADD COLUMN IF NOT EXISTS therapist VARCHAR",
    "ALTER TABLE steam_slot_templates ADD COLUMN IF NOT EXISTS room VARCHAR",
    "ALTER TABLE steam_slot_templates ADD COLUMN IF NOT EXISTS variant VARCHAR",
    "ALTER TABLE steam_slot_templates DROP CONSTRAINT IF EXISTS steam_slot_templates_service_chk",
    "ALTER TABLE steam_slot_templates ADD CONSTRAINT steam_slot_templates_service_chk CHECK (service_type IN ('steam','massage'))",
    "ALTER TABLE steam_slots ADD COLUMN IF NOT EXISTS service_type VARCHAR NOT NULL DEFAULT 'steam'",
    "ALTER TABLE steam_slots ADD COLUMN IF NOT EXISTS therapist VARCHAR",
    "ALTER TABLE steam_slots ADD COLUMN IF NOT EXISTS room VARCHAR",
    "ALTER TABLE steam_slots ADD COLUMN IF NOT EXISTS variant VARCHAR",
    "ALTER TABLE steam_slots DROP CONSTRAINT IF EXISTS steam_slots_service_chk",
    "ALTER TABLE steam_slots ADD CONSTRAINT steam_slots_service_chk CHECK (service_type IN ('steam','massage'))",
    "CREATE INDEX IF NOT EXISTS ix_steam_slots_service_starts ON steam_slots (service_type, starts_at)",
    "ALTER TABLE steam_bookings ADD COLUMN IF NOT EXISTS service_type VARCHAR NOT NULL DEFAULT 'steam'",
    "ALTER TABLE steam_bookings DROP CONSTRAINT IF EXISTS steam_bookings_service_chk",
    "ALTER TABLE steam_bookings ADD CONSTRAINT steam_bookings_service_chk CHECK (service_type IN ('steam','massage'))",
    "CREATE INDEX IF NOT EXISTS ix_steam_bookings_service_status ON steam_bookings (service_type, status)",
    # Reception portal: door scanner vs reception role separation on steam_staff
    "ALTER TABLE steam_staff ADD COLUMN IF NOT EXISTS role VARCHAR NOT NULL DEFAULT 'door_scanner'",
    "ALTER TABLE steam_staff DROP CONSTRAINT IF EXISTS steam_staff_role_chk",
    "ALTER TABLE steam_staff ADD CONSTRAINT steam_staff_role_chk CHECK (role IN ('door_scanner','reception'))",
    # Per-date per-guest booking-limit override. Row absent = global default applies;
    # column NULL = use global for that service on that day.
    """CREATE TABLE IF NOT EXISTS steam_day_overrides (
        day DATE PRIMARY KEY,
        max_steam_per_guest INTEGER,
        max_massage_per_guest INTEGER,
        note VARCHAR,
        created_at TIMESTAMPTZ DEFAULT now(),
        updated_at TIMESTAMPTZ DEFAULT now()
    )""",
    # Shared-password tablet auth (replaces per-staff magic links for reception +
    # door scanner). Stored as sha256(password + per-deploy salt). NULL = role-SPA
    # disabled until admin sets a password in Settings.
    "ALTER TABLE steam_settings ADD COLUMN IF NOT EXISTS reception_password_hash VARCHAR",
    "ALTER TABLE steam_settings ADD COLUMN IF NOT EXISTS scanner_password_hash VARCHAR",
]

with engine.begin() as conn:
    for sql in _MIGRATIONS:
        try:
            conn.execute(text(sql))
        except Exception as e:
            # Log and continue — these are best-effort, idempotent ops.
            print(f"[migrations] '{sql}' failed: {e}", flush=True)

# Seed the steam_settings singleton (id=1) if missing. Python-side defaults
# on the model populate the rest of the columns.
try:
    from app.core.database import SessionLocal
    from app.services.steam_settings import get_or_create_settings
    _seed_db = SessionLocal()
    try:
        get_or_create_settings(_seed_db)
    finally:
        _seed_db.close()
except Exception as e:
    print(f"[steam] seed failed: {e}", flush=True)

_default_origins = (
    "https://admin.trypranaextract.com,"
    "https://app.trypranaextract.com,"
    "https://book.atmos-steam.com,"       # guest UI
    "https://reception.atmos-steam.com,"  # reception portal (separate SPA)
    "https://admin.atmos-steam.com,"      # reserved for future admin domain on atmos-steam.com
    "https://app.atmos-steam.com"         # reserved likewise
)
_allow_origins = [o.strip() for o in os.getenv("CORS_ORIGINS", _default_origins).split(",") if o.strip()]

app.add_middleware(
    CORSMiddleware,
    allow_origins=_allow_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth.router, prefix="/auth", tags=["auth"])
app.include_router(tasks.router, prefix="/tasks", tags=["tasks"])
app.include_router(shifts.router, prefix="/shifts", tags=["shifts"])
app.include_router(media.router, prefix="/media", tags=["media"])
app.include_router(locations.router, prefix="/locations", tags=["locations"])
app.include_router(dashboard.router, prefix="/dashboard", tags=["dashboard"])
app.include_router(supervisors.router, prefix="/supervisors", tags=["supervisors"])
app.include_router(stats.router, prefix="/stats", tags=["stats"])
app.include_router(messages.router, prefix="/messages", tags=["messages"])
app.include_router(ai.router, prefix="/ai", tags=["ai"])
app.include_router(steam.router, prefix="/steam", tags=["steam"])


@app.get("/health")
def health_check():
    return {"status": "ok", "service": "Atmos API"}


@app.get("/")
def read_root():
    return {"message": "Welcome to Atmos Operations Layer"}
