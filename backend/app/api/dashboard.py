from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session, joinedload
from sqlalchemy import or_, and_
from datetime import datetime, timedelta
from typing import Optional

from app.core.database import get_db
from app.core.security import get_current_user
from app.models.all import Task, TaskTemplate, Shift, User
from app.schemas.dashboard import DashboardResponse

from app.core.time_utils import BALI_TZ, get_now

router = APIRouter()


def _resolve_day(date: Optional[str]) -> datetime:
    """Return start-of-day in Bali TZ for the given YYYY-MM-DD, or today's start if None."""
    if date:
        try:
            d = datetime.strptime(date, "%Y-%m-%d")
        except ValueError:
            raise HTTPException(status_code=400, detail="Invalid date format, use YYYY-MM-DD")
        return datetime(d.year, d.month, d.day, tzinfo=BALI_TZ)
    now = get_now()
    return datetime(now.year, now.month, now.day, tzinfo=BALI_TZ)


@router.get("/", response_model=DashboardResponse)
def get_dashboard_data(
    date: Optional[str] = None,
    user_id: Optional[int] = None,
    department: Optional[str] = None,
    _user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    Overview snapshot for a given calendar day.
    `date=YYYY-MM-DD` (Bali timezone). Defaults to today when omitted.
    `user_id` (optional) scopes KPI/today_tasks to that supervisor — both their
    personally-assigned tasks and unassigned tasks for the day (those any
    supervisor on shift can pick up).

    Returned KPIs and the `today_tasks` list are scoped to that day:
      - tasks scheduled within [day, day+1) OR completed within [day, day+1)
    """
    day_start = _resolve_day(date)
    day_end = day_start + timedelta(days=1)
    today_start = _resolve_day(None)  # used for overdue carry-over (always relative to today)

    # Tasks scheduled OR completed on the chosen day
    day_tasks_query = (
        db.query(Task)
        .join(TaskTemplate, Task.template_id == TaskTemplate.id)
        .options(joinedload(Task.template), joinedload(Task.photos), joinedload(Task.comments))
        .filter(
            or_(
                (Task.scheduled_date >= day_start) & (Task.scheduled_date < day_end),
                and_(
                    Task.status == "Completed",
                    Task.actual_completed_at >= day_start,
                    Task.actual_completed_at < day_end,
                ),
            )
        )
    )
    if user_id is not None:
        day_tasks_query = day_tasks_query.filter(
            or_(Task.assigned_user == user_id, Task.assigned_user.is_(None))
        )
    if department:
        day_tasks_query = day_tasks_query.filter(TaskTemplate.department == department.lower())
    day_tasks = day_tasks_query.all()
    total_tasks = len(day_tasks)
    completed_tasks = sum(1 for t in day_tasks if t.status == "Completed")
    not_completed = total_tasks - completed_tasks

    # Carry-over: non-daily tasks overdue strictly before today (Overdue card is "what's late as of now")
    overdue_query = (
        db.query(Task)
        .join(TaskTemplate, Task.template_id == TaskTemplate.id)
        .options(joinedload(Task.template), joinedload(Task.photos), joinedload(Task.comments))
        .filter(
            TaskTemplate.repeat_type != "daily",
            or_(
                Task.status == "Overdue",
                (Task.scheduled_date < today_start) & (Task.status != "Completed"),
            ),
        )
    )
    if user_id is not None:
        overdue_query = overdue_query.filter(
            or_(Task.assigned_user == user_id, Task.assigned_user.is_(None))
        )
    if department:
        overdue_query = overdue_query.filter(TaskTemplate.department == department.lower())
    overdue_count = overdue_query.count()
    overdue_list = overdue_query.all()

    missed_yesterday_list = (
        db.query(Task)
        .join(TaskTemplate, Task.template_id == TaskTemplate.id)
        .options(joinedload(Task.template), joinedload(Task.photos), joinedload(Task.comments))
        .filter(
            TaskTemplate.repeat_type == "daily",
            Task.scheduled_date < today_start,
            Task.status != "Completed",
        )
        .all()
    )

    # Active supervisors — by login on the chosen day
    active_staff_db = (
        db.query(User)
        .filter(User.last_login >= day_start, User.last_login < day_end)
        .all()
    )
    active_staff_list = []
    for u in active_staff_db:
        user_tasks = [t for t in day_tasks if t.assigned_user == u.id]
        active_staff_list.append({
            "id": u.id,
            "user_id": u.id,
            "user_name": u.name,
            "role": u.role,
            "center_id": u.center_id,
            "last_login": u.last_login,
            "tasks_assigned_today": len(user_tasks),
            "tasks_completed_today": sum(1 for t in user_tasks if t.status == "Completed"),
        })

    completion_rate = int((completed_tasks / total_tasks * 100)) if total_tasks > 0 else 0

    # Recent activity — purely informational, last few completions
    recent_done = (
        db.query(Task)
        .options(joinedload(Task.template), joinedload(Task.photos))
        .filter(Task.status == "Completed")
        .order_by(Task.id.desc())
        .limit(3)
        .all()
    )
    recent_activity = []
    for t in recent_done:
        user = db.query(User).filter(User.id == t.assigned_user).first()
        recent_activity.append({
            "task_id": t.id,
            "message": f"{(user.name if user else 'System')} completed {(t.template.name if t.template else f'Task #{t.id}')}",
            "time": "Just now",
            "type": "task",
        })

    kpis = {
        "total_tasks_today": total_tasks,
        "completed_tasks_today": completed_tasks,
        "total_not_completed_today": not_completed,
        "completion_rate": completion_rate,
        "active_supervisors": len(active_staff_db),
        "overdue_tasks": overdue_count,
        "new_alerts": 0,
    }

    return {
        "kpis": kpis,
        "recent_activity": recent_activity,
        "today_tasks": day_tasks,
        "overdue_tasks_list": overdue_list,
        "missed_yesterday_daily": missed_yesterday_list,
        "active_shifts": [],
        "active_staff_list": active_staff_list,
    }
