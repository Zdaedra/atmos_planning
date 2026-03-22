from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.api import auth, tasks, shifts, media, telegram, locations, alerts, dashboard, supervisors, stats, messages, ai
from app.core.database import engine
from app.models.all import Base

app = FastAPI(title="Atmos Operations API")

# Auto-create missing tables for MVP
Base.metadata.create_all(bind=engine)

from sqlalchemy import text
with engine.connect() as conn:
    try:
        conn.execute(text("ALTER TABLE task_templates ADD COLUMN default_assigned_user INTEGER REFERENCES users(id)"))
        conn.commit()
    except Exception:
        pass
        
    try:
        conn.execute(text("ALTER TABLE tasks ADD COLUMN ai_status VARCHAR DEFAULT 'pending'"))
        conn.execute(text("ALTER TABLE tasks ADD COLUMN ai_reasoning TEXT"))
        conn.commit()
    except Exception:
        pass

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth.router, prefix="/auth", tags=["auth"])
app.include_router(tasks.router, prefix="/tasks", tags=["tasks"])
app.include_router(shifts.router, prefix="/shifts", tags=["shifts"])
app.include_router(media.router, prefix="/media", tags=["media"])
app.include_router(locations.router, prefix="/locations", tags=["locations"])
app.include_router(alerts.router, prefix="/alerts", tags=["alerts"])
app.include_router(dashboard.router, prefix="/dashboard", tags=["dashboard"])
app.include_router(supervisors.router, prefix="/supervisors", tags=["supervisors"])
app.include_router(telegram.router)
app.include_router(stats.router, prefix="/stats", tags=["stats"])
app.include_router(messages.router, prefix="/messages", tags=["messages"])
app.include_router(ai.router, prefix="/ai", tags=["ai"])

@app.get("/health")
def health_check():
    return {"status": "ok", "service": "Atmos API"}

@app.get("/")
def read_root():
    return {"message": "Welcome to Atmos Operations Layer"}
