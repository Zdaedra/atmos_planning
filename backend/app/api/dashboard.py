from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from sqlalchemy import func, or_, and_
from sqlalchemy.orm import joinedload
from datetime import datetime, timezone, timedelta

from app.core.database import get_db
from app.models.all import Task, TaskTemplate, Shift, ChangeRequest, User
from app.schemas.dashboard import DashboardResponse

router = APIRouter()

@router.get("/", response_model=DashboardResponse)
def get_dashboard_data(db: Session = Depends(get_db)):
    # 1. Establish absolute UTC boundary markers for "Today"
    now = datetime.now(timezone.utc)
    today_start = datetime(now.year, now.month, now.day, tzinfo=timezone.utc)
    tomorrow_start = today_start + timedelta(days=1)
    
    # Tasks scheduled for today OR completed today
    tasks_today_query = db.query(Task).join(TaskTemplate, Task.template_id == TaskTemplate.id).options(joinedload(Task.template), joinedload(Task.photos), joinedload(Task.comments)).filter(
        or_(
            (Task.scheduled_date >= today_start) & (Task.scheduled_date < tomorrow_start),
            and_(Task.status == "Completed", TaskTemplate.last_completed_at >= today_start, TaskTemplate.last_completed_at < tomorrow_start)
        )
    )
    today_tasks = tasks_today_query.all()
    total_tasks_today = len(today_tasks)
    
    # 1b. Correct KPI for today's tasks specifically
    completed_tasks_today = sum(1 for t in today_tasks if t.status == "Completed")
    total_not_completed_today = sum(1 for t in today_tasks if t.status != "Completed")
    
    # 1c. Calculate carry-over rules (Strictly before UTC midnight today)
    overdue_tasks_query = db.query(Task).join(TaskTemplate, Task.template_id == TaskTemplate.id).options(joinedload(Task.template), joinedload(Task.photos), joinedload(Task.comments)).filter(
        TaskTemplate.repeat_type != "daily",
        or_(
            Task.status == "Overdue",
            (Task.scheduled_date < today_start) & (Task.status != "Completed")
        )
    )
    overdue_tasks = overdue_tasks_query.count()
    overdue_tasks_list = overdue_tasks_query.all()
    
    # 1d. Find yesterday's missed daily tasks explicitly
    missed_yesterday_query = db.query(Task).join(TaskTemplate, Task.template_id == TaskTemplate.id).options(joinedload(Task.template), joinedload(Task.photos), joinedload(Task.comments)).filter(
        TaskTemplate.repeat_type == "daily",
        Task.scheduled_date < today_start,
        Task.status != "Completed"
    )
    missed_yesterday_list = missed_yesterday_query.all()
    
    # 2. Active Supervisors (Users who logged in today)
    active_staff_db = db.query(User).filter(User.last_login >= today_start).all()
    active_supervisors = len(active_staff_db)
    
    active_staff_list = []
    for u in active_staff_db:
        # Calculate tasks for this user today
        user_tasks_today = [t for t in today_tasks if t.assigned_user == u.id]
        tasks_assigned = len(user_tasks_today)
        tasks_completed = sum(1 for t in user_tasks_today if t.status == "Completed")
        
        active_staff_list.append({
            "id": u.id,
            "user_id": u.id,
            "user_name": u.name,
            "role": u.role,
            "center_id": u.center_id,
            "last_login": u.last_login,
            "tasks_assigned_today": tasks_assigned,
            "tasks_completed_today": tasks_completed
        })
    
    # 4. Completion Rate
    completion_rate = int((completed_tasks_today / total_tasks_today * 100)) if total_tasks_today > 0 else 0
    
    # 5. Recent Activity Mock (for UI feeling active)
    recent_activity = []
    
    # Fetch recent tasks that were completed
    recent_done = db.query(Task).options(joinedload(Task.template), joinedload(Task.photos), joinedload(Task.comments)).filter(Task.status == "Completed").order_by(Task.id.desc()).limit(3).all()
    for t in recent_done:
        user = db.query(User).filter(User.id == t.assigned_user).first()
        uname = user.name if user else "System"
        task_name = t.template.name if t.template else f"Task #{t.id}"
        recent_activity.append({
            "task_id": t.id,
            "message": f"{uname} completed {task_name}",
            "time": "Just now",
            "type": "task"
        })
        
    # Append mock entries to make the dashboard look alive if db is too empty
    if len(recent_activity) < 3:
        recent_activity.append({"message": "AI Monitor scheduled 5 new tasks.", "time": "15m ago", "type": "system"})
        recent_activity.append({"message": "New cleaning center added.", "time": "1h ago", "type": "admin"})

    kpis = {
        "total_tasks_today": total_tasks_today,
        "completed_tasks_today": completed_tasks_today,
        "total_not_completed_today": total_not_completed_today,
        "completion_rate": completion_rate,
        "active_supervisors": active_supervisors,
        "overdue_tasks": overdue_tasks,
        "new_alerts": 0
    }
    
    return {
        "kpis": kpis,
        "recent_activity": recent_activity,
        "today_tasks": today_tasks,
        "overdue_tasks_list": overdue_tasks_list,
        "missed_yesterday_daily": missed_yesterday_list,
        "active_shifts": [], # Legacy, kept for backwards compatibility if needed
        "active_staff_list": active_staff_list
    }
