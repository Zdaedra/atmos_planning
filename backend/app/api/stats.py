from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session, joinedload
from sqlalchemy import func
from datetime import datetime, timedelta, timezone
from typing import List, Dict, Any

from app.core.database import get_db
from app.models.all import Task, User, Zone

router = APIRouter()

@router.get("/personnel")
def get_personnel_stats(timeframe: str = "week", db: Session = Depends(get_db)):
    """
    Returns global completion/failed stats and a grid of supervisor performance metrics.
    """
    now = datetime.now(timezone.utc)
    if timeframe == "month":
        start_date = now - timedelta(days=30)
    elif timeframe == "today":
        start_date = now
    elif timeframe == "all":
        start_date = datetime(2020, 1, 1, tzinfo=timezone.utc)
    else:
        start_date = now - timedelta(days=7)
        
    start_date = start_date.replace(hour=0, minute=0, second=0, microsecond=0)

    # All supervisors and garden supervisors
    users = db.query(User).filter(User.role.in_(["supervisor", "garden supervisor"])).all()
    user_map = {
        u.id: {
            "user_id": u.id,
            "name": u.name,
            "role": u.role,
            "is_active": getattr(u, "is_active", True),
            "shifts_count": 0,
            "_distinct_days": set(),
            "daily": {"completed": 0, "failed": 0, "failed_percent": 0},
            "planned": {"completed": 0, "failed": 0, "failed_percent": 0},
            "project": {"completed": 0, "failed": 0, "failed_percent": 0},
            "assigned": {"completed": 0, "failed": 0, "failed_percent": 0},
            "avg_per_shift": 0.0
        } for u in users
    }

    from app.models.all import TaskTemplate
    tasks = db.query(Task, TaskTemplate.repeat_type).join(
        TaskTemplate, Task.template_id == TaskTemplate.id, isouter=True
    ).filter(
        Task.scheduled_date >= start_date,
        Task.status.in_(["Completed", "Overdue"])
    ).all()

    global_failed = 0
    global_completed = 0

    for t, repeat_type in tasks:
        r_type = (repeat_type or "none").lower()
        if r_type in ["weekly", "biweekly", "monthly", "planned", "bi-weekly"]:
            r_type = "planned"
        elif r_type in ["project", "daily"]:
            pass
        else:
            r_type = "assigned"
            
        is_completed = t.status == "Completed"
        is_overdue = t.status == "Overdue"
        
        if is_completed:
            global_completed += 1
            uid = t.assigned_user
            if uid and uid in user_map:
                user_map[uid][r_type]["completed"] += 1
                if t.scheduled_date:
                    user_map[uid]["_distinct_days"].add(t.scheduled_date.strftime("%Y-%m-%d"))
                    
        elif is_overdue:
            global_failed += 1
            uid = t.assigned_user
            # Only count as a personal failure if explicitly assigned
            if uid and uid in user_map:
                user_map[uid][r_type]["failed"] += 1
                if t.scheduled_date:
                    user_map[uid]["_distinct_days"].add(t.scheduled_date.strftime("%Y-%m-%d"))

    personnel = []
    for uid, data in user_map.items():
        data["shifts_count"] = len(data["_distinct_days"])
        del data["_distinct_days"]
        
        total_tasks = 0
        for cat in ["daily", "planned", "project", "assigned"]:
            c = data[cat]["completed"]
            f = data[cat]["failed"]
            total = c + f
            total_tasks += total
            data[cat]["failed_percent"] = round((f / total * 100)) if total > 0 else 0
            data[cat]["avg_per_shift"] = round((total / data["shifts_count"]), 1) if data["shifts_count"] > 0 else 0.0
            
        data["avg_per_shift"] = round((total_tasks / data["shifts_count"]), 1) if data["shifts_count"] > 0 else 0.0
        
        personnel.append(data)
        
    personnel = sorted(personnel, key=lambda x: (not x["is_active"], -(x["planned"]["completed"] + x["daily"]["completed"])))

    return {
        "global_failed": global_failed,
        "global_completed": global_completed,
        "personnel": personnel
    }

@router.get("/personnel/{user_id}")
def get_supervisor_details(user_id: int, timeframe: str = "week", db: Session = Depends(get_db)):
    """
    Returns detailed metrics for a specific supervisor's drawer card.
    """
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        return {"error": "User not found"}

    now = datetime.now(timezone.utc)
    if timeframe == "month":
        start_date = now - timedelta(days=30)
    elif timeframe == "today":
        start_date = now
    elif timeframe == "all":
        start_date = datetime(2020, 1, 1, tzinfo=timezone.utc)
    else:
        start_date = now - timedelta(days=7)
        
    start_date = start_date.replace(hour=0, minute=0, second=0, microsecond=0)

    # All completed tasks for this user in timeframe
    completed_tasks = db.query(Task).filter(
        Task.assigned_user == user_id,
        Task.status == "Completed",
        Task.scheduled_date >= start_date
    ).all()

    total_completed = len(completed_tasks)
    
    # Shifts per Period (Unique Days)
    distinct_days = set()
    # Time series for Recharts
    daily_map = {}
    
    if timeframe == "month":
        days = 30
        chart_start = start_date
    elif timeframe == "today":
        days = 0
        chart_start = start_date
    elif timeframe == "all":
        days = 30
        chart_start = now.replace(hour=0, minute=0, second=0, microsecond=0) - timedelta(days=30)
    else:
        days = 7
        chart_start = start_date
        
    for i in range(days + 1):
        d_str = (chart_start + timedelta(days=i)).strftime("%Y-%m-%d")
        daily_map[d_str] = 0

    failed_tasks = db.query(Task).filter(
        Task.assigned_user == user_id,
        Task.status.in_(["Overdue", "Failed"]),
        Task.scheduled_date >= start_date
    ).order_by(Task.scheduled_date.desc()).limit(10).all()

    recent_tasks = [{
        "id": t.id,
        "name": t.template.name if t.template else f"Task #{t.id}",
        "date": t.scheduled_date.isoformat() if t.scheduled_date else None
    } for t in failed_tasks]


    # Format the chart data
    chart_data = [{"date": k, "completed": v} for k, v in sorted(daily_map.items())]

    shifts_count = len(distinct_days)
    avg_per_shift = round(total_completed / shifts_count, 1) if shifts_count > 0 else 0

    return {
        "user": {
            "id": user.id,
            "name": user.name,
            "role": user.role,
            "last_login": user.last_login.isoformat() if user.last_login else None
        },
        "kpis": {
            "total_completed": total_completed,
            "shifts_count": shifts_count,
            "avg_per_shift": avg_per_shift
        },
        "daily_chart": chart_data,
        "recent_tasks": recent_tasks
    }


@router.get("/personnel/{user_id}/shifts")
def get_supervisor_shifts(user_id: int, timeframe: str = "all", db: Session = Depends(get_db)):
    """
    Returns detailed daily shift metrics for a specific supervisor, identical in structure to personnel KPI cards.
    """
    now = datetime.now(timezone.utc)
    if timeframe == "month":
        start_date = now - timedelta(days=30)
    elif timeframe == "week":
        start_date = now - timedelta(days=7)
    elif timeframe == "today":
        start_date = now.replace(hour=0, minute=0, second=0, microsecond=0)
    else:
        start_date = datetime(2020, 1, 1, tzinfo=timezone.utc)
        
    start_date = start_date.replace(hour=0, minute=0, second=0, microsecond=0)

    tasks_by_user = db.query(Task).options(joinedload(Task.template), joinedload(Task.photos)).filter(
        Task.assigned_user == user_id,
        Task.scheduled_date >= start_date
    ).order_by(Task.scheduled_date.desc()).all()

    shift_map = {}
    
    for t in tasks_by_user:
        if not t.scheduled_date:
            continue
            
        d_str = t.scheduled_date.strftime("%Y-%m-%d")
        
        if d_str not in shift_map:
            shift_map[d_str] = {
                "date": d_str,
                "daily": {"completed": 0, "failed": 0, "failed_percent": 0},
                "planned": {"completed": 0, "failed": 0, "failed_percent": 0},
                "project": {"completed": 0, "failed": 0, "failed_percent": 0},
                "assigned": {"completed": 0, "failed": 0, "failed_percent": 0},
                "tasks": []
            }
            
        r_type = ""
        if t.template:
            r_type = (t.template.repeat_type or "").lower()
            
        if r_type in ["weekly", "biweekly", "bi-weekly", "monthly"]:
            r_type = "planned"
        elif r_type in ["project", "daily"]:
            pass
        else:
            r_type = "assigned"
            
        is_completed = t.status == "Completed"
        is_overdue = t.status == "Overdue" or t.status == "Failed"
        
        if is_completed:
            shift_map[d_str][r_type]["completed"] += 1
        elif is_overdue:
            shift_map[d_str][r_type]["failed"] += 1
            
        shift_map[d_str]["tasks"].append({
            "id": t.id,
            "name": t.template.name if t.template else "Custom Task",
            "status": t.status,
            "type": r_type,
            "photos": [p.url for p in getattr(t, 'photos', [])] if getattr(t, 'photos', None) else []
        })

    shifts = []
    for d_str, data in shift_map.items():
        total_tasks = 0
        for cat in ["daily", "planned", "project", "assigned"]:
            c = data[cat]["completed"]
            f = data[cat]["failed"]
            total = c + f
            total_tasks += total
            data[cat]["failed_percent"] = round((f / total * 100)) if total > 0 else 0
            
        if total_tasks > 0:
            shifts.append(data)
            
    shifts = sorted(shifts, key=lambda x: x["date"], reverse=True)
    return shifts
