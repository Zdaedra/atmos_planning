from pydantic import BaseModel
from typing import List, Optional
from datetime import datetime
from app.schemas.task import TaskResponse, TaskWithTemplateResponse

class ActiveShiftResponse(BaseModel):
    id: int
    user_id: int
    user_name: Optional[str] = None
    role: Optional[str] = None
    start_time: datetime
    tasks_assigned_today: int = 0
    tasks_completed_today: int = 0

class DashboardKPIs(BaseModel):
    total_tasks_today: int
    completed_tasks_today: int
    total_not_completed_today: int
    completion_rate: int
    active_supervisors: int
    overdue_tasks: int
    new_alerts: int

class DashboardResponse(BaseModel):
    kpis: DashboardKPIs
    recent_activity: List[dict]
    today_tasks: List[TaskWithTemplateResponse] = []
    overdue_tasks_list: List[TaskWithTemplateResponse] = []
    missed_yesterday_daily: List[TaskWithTemplateResponse] = []
    active_shifts: List[ActiveShiftResponse] = []
