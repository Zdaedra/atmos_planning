from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session, joinedload
from sqlalchemy import func
from datetime import datetime, timedelta, timezone
from typing import List, Dict, Any, Optional

from app.core.database import get_db
from app.core.security import require_admin
from app.models.all import Task, User, Zone, Shift

from app.core.time_utils import BALI_TZ, get_now, get_today_start, to_bali

router = APIRouter()

@router.get("/personnel")
def get_personnel_stats(timeframe: str = "week",
                        department: Optional[str] = None,
                        _admin: User = Depends(require_admin),
                        db: Session = Depends(get_db)):
    """
    Returns global completion/failed stats and a grid of supervisor performance metrics.
    """
    now = get_now()
    if timeframe == "month":
        start_date = now - timedelta(days=30)
    elif timeframe == "today":
        start_date = now
    elif timeframe == "all":
        start_date = datetime(2020, 1, 1, tzinfo=BALI_TZ)
    else:
        start_date = now - timedelta(days=7)
        
    start_date = start_date.replace(hour=0, minute=0, second=0, microsecond=0)
    end_date = now + timedelta(days=1)
    end_date = end_date.replace(hour=0, minute=0, second=0, microsecond=0)

    # All supervisors and garden supervisors
    users = db.query(User).filter(User.role.in_(["supervisor", "garden supervisor"])).all()
    user_map = {
        u.id: {
            "user_id": u.id,
            "name": u.name,
            "role": u.role,
            "email": u.email,
            "is_active": getattr(u, "is_active", True),
            "shifts_count": 0,
            "_distinct_days": set(),
            "daily": {"completed": 0, "failed": 0, "failed_percent": 0},
            "planned": {"completed": 0, "failed": 0, "failed_percent": 0},
            "project": {"completed": 0, "failed": 0, "failed_percent": 0},
            "mini": {"completed": 0, "failed": 0, "failed_percent": 0},
            "assigned": {"completed": 0, "failed": 0, "failed_percent": 0},
            "avg_per_shift": 0.0
        } for u in users
    }

    from app.models.all import TaskTemplate
    tasks_q = db.query(Task, TaskTemplate.repeat_type, TaskTemplate.time_of_day).join(
        TaskTemplate, Task.template_id == TaskTemplate.id, isouter=True
    ).filter(
        Task.scheduled_date >= start_date,
        Task.scheduled_date < end_date
    )
    if department:
        tasks_q = tasks_q.filter(TaskTemplate.department == department.lower())
    tasks = tasks_q.all()

    # Pre-fetch shifts to map Unassigned tasks to all active shift supervisors
    active_shifts = db.query(Shift).filter(
        Shift.start_time >= start_date,
        Shift.start_time < end_date
    ).all()
    shifts_by_date = {}
    shift_numbers_by_user_date = {}
    for s in active_shifts:
        if s.start_time:
            ds = s.start_time.strftime("%Y-%m-%d")
            shifts_by_date.setdefault(ds, set()).add(s.user_id)
            shift_numbers_by_user_date.setdefault(ds, {})[s.user_id] = s.shift_number
            if s.user_id in user_map:
                user_map[s.user_id]["_distinct_days"].add(ds) # Phase 67: Register explicit shift record

    global_failed = 0
    global_completed = 0

    for t, repeat_type, time_of_day in tasks:
        r_type = (repeat_type or "none").lower()
        if r_type in ["weekly", "biweekly", "monthly", "planned", "bi-weekly", "custom"]:
            r_type = "planned"
        elif r_type in ["project", "daily", "mini"]:
            pass
        else:
            r_type = "assigned"
            
        is_completed = t.status == "Completed"
        
        d_str = t.scheduled_date.strftime("%Y-%m-%d") if t.scheduled_date else None
        
        target_uids = set()
        if t.assigned_user:
            target_uids.add(t.assigned_user)
        elif d_str and d_str in shifts_by_date:
            target_uids.update(shifts_by_date[d_str])
            
        actual_uids = set()
        task_shift = str(time_of_day).lower() if time_of_day else "anytime"
        for uid in target_uids:
            if task_shift in ["1", "2"] and d_str in shift_numbers_by_user_date and uid in shift_numbers_by_user_date[d_str]:
                user_shift = str(shift_numbers_by_user_date[d_str][uid])
                # shift_number=3 means "full day" — supervisor covers both shifts.
                if user_shift != "3" and task_shift != user_shift:
                    continue
            actual_uids.add(uid)
            
        if is_completed:
            global_completed += 1
            for uid in actual_uids:
                if uid in user_map:
                    user_map[uid][r_type]["completed"] += 1
        else:
            global_failed += 1
            for uid in actual_uids:
                if uid in user_map:
                    user_map[uid][r_type]["failed"] += 1

    personnel = []
    for uid, data in user_map.items():
        data["shifts_count"] = len(data["_distinct_days"])
        del data["_distinct_days"]
        
        total_tasks = 0
        for cat in ["daily", "planned", "project", "mini", "assigned"]:
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
def get_supervisor_details(user_id: int, timeframe: str = "week",
                           department: Optional[str] = None,
                           _admin: User = Depends(require_admin),
                           db: Session = Depends(get_db)):
    """
    Returns detailed metrics for a specific supervisor's drawer card.
    """
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        return {"error": "User not found"}

    now = get_now()
    if timeframe == "month":
        start_date = now - timedelta(days=30)
    elif timeframe == "today":
        start_date = now
    elif timeframe == "all":
        start_date = datetime(2020, 1, 1, tzinfo=BALI_TZ)
    else:
        start_date = now - timedelta(days=7)
    start_date = start_date.replace(hour=0, minute=0, second=0, microsecond=0)
    end_date = now + timedelta(days=1)
    end_date = end_date.replace(hour=0, minute=0, second=0, microsecond=0)

    # Get valid shift dates for this user
    active_shifts = db.query(Shift).filter(
        Shift.user_id == user_id,
        Shift.start_time >= start_date,
        Shift.start_time < end_date
    ).all()
    valid_shift_dates = {s.start_time.strftime("%Y-%m-%d") for s in active_shifts if s.start_time}

    from sqlalchemy import or_
    from app.models.all import TaskTemplate as _T
    aptq = db.query(Task).options(joinedload(Task.template)).filter(
        or_(Task.assigned_user == user_id, Task.assigned_user == None),
        Task.scheduled_date >= start_date,
        Task.scheduled_date < end_date
    )
    if department:
        aptq = aptq.join(_T, Task.template_id == _T.id).filter(_T.department == department.lower())
    all_potential_tasks = aptq.order_by(Task.scheduled_date.desc()).all()

    completed_tasks = []
    failed_tasks = []
    
    distinct_days = set()
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

    for t in all_potential_tasks:
        d_str = t.scheduled_date.strftime("%Y-%m-%d") if t.scheduled_date else None
        
        # If unassigned and not on a shift day, skip
        if not t.assigned_user and d_str not in valid_shift_dates:
            continue
            
        if t.status == "Completed":
            completed_tasks.append(t)
            if d_str and d_str in daily_map:
                daily_map[d_str] += 1
        else:
            failed_tasks.append(t)

    # Phase 67: Explicit actual mapping
    distinct_days = valid_shift_dates

    total_completed = len(completed_tasks)
    
    # recent_tasks should only take top 10 failed tasks
    recent_failed = failed_tasks[:10]
    recent_tasks = [{
        "id": t.id,
        "name": t.template.name if t.template else f"Task #{t.id}",
        "date": t.scheduled_date.isoformat() if t.scheduled_date else None
    } for t in recent_failed]

    # Format the chart data
    chart_data = [{"date": k, "completed": v} for k, v in sorted(daily_map.items())]

    shifts_count = len(distinct_days)
    avg_per_shift = round(total_completed / shifts_count, 1) if shifts_count > 0 else 0

    return {
        "user": {
            "id": user.id,
            "name": user.name,
            "role": user.role,
            "email": user.email,
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
def get_supervisor_shifts(user_id: int, timeframe: str = "all",
                          department: Optional[str] = None,
                          _admin: User = Depends(require_admin),
                          db: Session = Depends(get_db)):
    """
    Returns detailed daily shift metrics for a specific supervisor, identical in structure to personnel KPI cards.
    """
    now = get_now()
    if timeframe == "month":
        start_date = now - timedelta(days=30)
    elif timeframe == "week":
        start_date = now - timedelta(days=7)
    elif timeframe == "today":
        start_date = now.replace(hour=0, minute=0, second=0, microsecond=0)
    else:
        start_date = datetime(2020, 1, 1, tzinfo=BALI_TZ)
    start_date = start_date.replace(hour=0, minute=0, second=0, microsecond=0)
    end_date = now + timedelta(days=1)
    end_date = end_date.replace(hour=0, minute=0, second=0, microsecond=0)

    from sqlalchemy import or_
    from app.models.all import TaskTemplate as _T2
    tbq = db.query(Task).options(joinedload(Task.template), joinedload(Task.photos)).filter(
        or_(Task.assigned_user == user_id, Task.assigned_user == None),
        Task.scheduled_date >= start_date,
        Task.scheduled_date < end_date
    )
    if department:
        tbq = tbq.join(_T2, Task.template_id == _T2.id).filter(_T2.department == department.lower())
    tasks_by_user = tbq.order_by(Task.scheduled_date.desc()).all()

    # Get valid dates where user actually started a shift
    valid_shift_dates = set()
    shift_numbers_by_date = {}
    shift_coords_by_date = {}
    actual_shifts = db.query(Shift).filter(
        Shift.user_id == user_id,
        Shift.start_time >= start_date,
        Shift.start_time < end_date
    ).all()
    for s in actual_shifts:
        if s.start_time:
            ds = s.start_time.strftime("%Y-%m-%d")
            valid_shift_dates.add(ds)
            shift_numbers_by_date[ds] = str(s.shift_number)
            shift_coords_by_date[ds] = {"latitude": s.latitude, "longitude": s.longitude}

    shift_map = {}
    for d_str in valid_shift_dates:
        shift_map[d_str] = {
            "date": d_str,
            "latitude": shift_coords_by_date.get(d_str, {}).get("latitude"),
            "longitude": shift_coords_by_date.get(d_str, {}).get("longitude"),
            "daily": {"completed": 0, "failed": 0, "failed_percent": 0},
            "planned": {"completed": 0, "failed": 0, "failed_percent": 0},
            "project": {"completed": 0, "failed": 0, "failed_percent": 0},
            "mini": {"completed": 0, "failed": 0, "failed_percent": 0},
            "assigned": {"completed": 0, "failed": 0, "failed_percent": 0},
            "tasks": []
        }
    
    for t in tasks_by_user:
        if not t.scheduled_date:
            continue
            
        d_str = t.scheduled_date.strftime("%Y-%m-%d")
        
        # Only show days the supervisor actually worked a shift
        if d_str not in valid_shift_dates:
            continue
            
        r_type = ""
        task_shift = "anytime"
        if t.template:
            r_type = (t.template.repeat_type or "").lower()
            task_shift = str(t.template.time_of_day).lower() if t.template.time_of_day else "anytime"
            
        if task_shift in ["1", "2"]:
            user_shift = shift_numbers_by_date.get(d_str, "1")
            if user_shift != "3" and task_shift != user_shift:
                continue
            
        if r_type in ["weekly", "biweekly", "bi-weekly", "monthly", "custom"]:
            r_type = "planned"
        elif r_type in ["project", "daily", "mini"]:
            pass
        else:
            r_type = "assigned"
            
        is_completed = t.status == "Completed"
        
        if is_completed:
            shift_map[d_str][r_type]["completed"] += 1
        else:
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
        for cat in ["daily", "planned", "project", "mini", "assigned"]:
            c = data[cat]["completed"]
            f = data[cat]["failed"]
            total = c + f
            total_tasks += total
            data[cat]["failed_percent"] = round((f / total * 100)) if total > 0 else 0
            
        # Phase 67: Always append shift even if total_tasks == 0
        shifts.append(data)
            
    shifts = sorted(shifts, key=lambda x: x["date"], reverse=True)
    return shifts
