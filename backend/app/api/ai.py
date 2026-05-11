from fastapi import APIRouter, Depends, HTTPException, BackgroundTasks
from sqlalchemy.orm import Session
from typing import Optional
from app.core.database import get_db
from app.core.security import get_current_user, require_admin
from app.models.all import Task, TaskPhoto, TaskTemplate, User, AppSetting
import os
import json
import httpx
import logging

from app.core.time_utils import BALI_TZ, get_now, get_today_start, to_bali

router = APIRouter()
logger = logging.getLogger(__name__)

async def verify_task_photos_ai(task_id: int):
    """
    Background worker that fetches task photos and sends them to OpenAI Vision API for verification against the task definition.
    Updates the Task.ai_status and Task.ai_reasoning based on the response.
    """
    # 1. Provide dedicated db session for background task
    from app.core.database import SessionLocal
    db = SessionLocal()
    
    try:
        task = db.query(Task).filter(Task.id == task_id).first()
        if not task:
            return
            
        photos = db.query(TaskPhoto).filter(TaskPhoto.task_id == task_id).all()
        if not photos:
            # Nothing to verify
            task.ai_status = "approved"
            task.ai_reasoning = "No photo required or uploaded."
            db.commit()
            return
            
        template = db.query(TaskTemplate).filter(TaskTemplate.id == task.template_id).first()
        task_name = template.name if template else "Unknown Task"
        task_desc = template.description if template else "No description"
        
        # Format images for OpenAI payload
        image_content = []
        for p in photos:
            image_content.append({
                "type": "image_url",
                "image_url": {
                    "url": p.url
                }
            })
            
        user_content = [
            {
                "type": "text",
                "text": f"Task Name: {task_name}\nTask Description: {task_desc}\n\nPlease evaluate the attached photos."
            }
        ]
        user_content.extend(image_content)
        
        m = [
            {
                "role": "system",
                "content": (
                    "You are an objective AI Quality Control inspector for facility management.\n"
                    "Evaluate if the provided photo shows the task is properly completed without hazards or defects.\n"
                    "Reject photos that are black screens, blurred, selfies, or irrelevant (anti-fraud).\n"
                    "Return ONLY valid JSON: {'approved': boolean, 'reasoning': string(1-2 sentences)}."
                )
            },
            {
                "role": "user",
                "content": user_content
            }
        ]
        
        api_key = os.environ.get("OPENAI_API_KEY")
        if not api_key:
            logger.warning("OPENAI_API_KEY missing. Skipping AI verification.")
            task.ai_status = "pending"
            task.ai_reasoning = "Verification skipped: API Key missing."
            db.commit()
            return

        async with httpx.AsyncClient(timeout=30.0) as client:
            response = await client.post(
                "https://api.openai.com/v1/chat/completions",
                headers={"Authorization": f"Bearer {api_key}"},
                json={
                    "model": "gpt-4o",
                    "messages": m,
                    "response_format": {"type": "json_object"},
                    "max_tokens": 300,
                    "temperature": 0.0
                }
            )
            
            if response.status_code == 200:
                result_json = response.json()
                content = result_json["choices"][0]["message"]["content"]
                
                try:
                    parsed = json.loads(content)
                    is_approved = parsed.get("approved", False)
                    reasoning = parsed.get("reasoning", "No valid explanation provided.")
                    
                    task.ai_status = "approved" if is_approved else "flagged"
                    task.ai_reasoning = reasoning
                    
                except json.JSONDecodeError:
                    task.ai_status = "flagged"
                    task.ai_reasoning = "AI returned malformed JSON response."
                    
            else:
                logger.error(f"OpenAI API error: {response.text}")
                task.ai_status = "flagged"
                task.ai_reasoning = f"API verification failed: {response.status_code}"
                
        db.commit()
        
    except Exception as e:
        logger.error(f"Background verification exception: {e}")
        try:
            db.rollback()
        except:
            pass
    finally:
        db.close()


DEFAULT_OVERDUE_ALERT_DAYS = {
    "daily": 1,
    "weekly": 2,
    "biweekly": 3,
    "monthly": 5,
    "custom": 2,
    "project": 2,
    "mini": 1,
}
ALERT_GROUPS = list(DEFAULT_OVERDUE_ALERT_DAYS.keys())
_SETTING_KEY = "alert_days."


def _setting_key(repeat_type: str) -> str:
    return _SETTING_KEY + repeat_type.lower()


def _read_group_threshold(db: Session, repeat_type: str) -> int:
    """Resolve threshold for a repeat_type group: app_settings override → hardcoded default."""
    rt = (repeat_type or "").lower()
    row = db.query(AppSetting).filter(AppSetting.key == _setting_key(rt)).first()
    if row and row.value is not None:
        try:
            n = int(row.value)
            if n >= 0:
                return n
        except (TypeError, ValueError):
            pass
    return DEFAULT_OVERDUE_ALERT_DAYS.get(rt, 1)


def _alert_threshold(db: Session, template) -> int:
    rt = (getattr(template, "repeat_type", None) or "").lower() if template else ""
    return _read_group_threshold(db, rt)


def _set_group_threshold(db: Session, repeat_type: str, days: Optional[int]) -> None:
    rt = (repeat_type or "").lower()
    if rt not in DEFAULT_OVERDUE_ALERT_DAYS:
        raise HTTPException(status_code=400, detail=f"Unknown repeat_type group: {repeat_type}")
    key = _setting_key(rt)
    row = db.query(AppSetting).filter(AppSetting.key == key).first()
    if days is None:
        if row:
            db.delete(row)
        return
    if days < 0:
        raise HTTPException(status_code=400, detail="overdue_alert_days must be >= 0")
    if row:
        row.value = str(days)
    else:
        db.add(AppSetting(key=key, value=str(days)))


@router.get("/review-feed")
def get_ai_review_feed(
    date: Optional[str] = None,
    department: Optional[str] = None,
    _admin: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    """
    Alerts that FIRE on the given day (Bali tz). `date=YYYY-MM-DD`. Default=today.

    An alert fires on day D for a task when:
      * task is not Completed by start_of(D), AND
      * floor((D - scheduled_date) days) == threshold for its repeat_type group.

    This produces a daily feed (no accumulation across days).
    """
    from datetime import datetime, timedelta
    from app.models.all import User

    if date:
        try:
            d = datetime.strptime(date, "%Y-%m-%d")
        except ValueError:
            raise HTTPException(status_code=400, detail="Invalid date format, use YYYY-MM-DD")
        cutoff = datetime(d.year, d.month, d.day, tzinfo=BALI_TZ)
    else:
        now_utc = get_now()
        cutoff = datetime(now_utc.year, now_utc.month, now_utc.day, tzinfo=BALI_TZ)
    cutoff_end = cutoff + timedelta(days=1)

    # Cap the candidate window: tasks scheduled in [cutoff - 60d, cutoff)
    # (per-template thresholds default <=5d; 60 is a generous safety net).
    cand_q = (
        db.query(Task)
        .filter(
            Task.scheduled_date < cutoff,
            Task.scheduled_date >= cutoff - timedelta(days=60),
            (Task.actual_completed_at.is_(None)) | (Task.actual_completed_at >= cutoff),
        )
    )
    if department:
        cand_q = cand_q.join(TaskTemplate, Task.template_id == TaskTemplate.id).filter(
            TaskTemplate.department == department.lower()
        )
    candidates = cand_q.order_by(Task.scheduled_date.asc()).all()

    daily_alerts = []
    project_alerts = []

    for t in candidates:
        if not t.scheduled_date:
            continue
        template = db.query(TaskTemplate).filter(TaskTemplate.id == t.template_id).first()
        threshold = _alert_threshold(db, template)
        days_overdue = (cutoff - t.scheduled_date).days
        # Alert fires on the exact day the task crosses the threshold.
        if days_overdue != threshold:
            continue

        user = db.query(User).filter(User.id == t.assigned_user).first() if t.assigned_user else None
        task_data = {
            "task_id": t.id,
            "task_name": template.name if template else f"Task #{t.id}",
            "assigned_user_name": user.name if user else None,
            "assigned_user_avatar": user.avatar_url if user and hasattr(user, "avatar_url") else None,
            "scheduled_date": t.scheduled_date.isoformat() if t.scheduled_date else None,
            "days_overdue": days_overdue,
            "alert_threshold": threshold,
            "repeat_type": (template.repeat_type if template else None),
        }
        if template and (template.repeat_type or "").lower() == "daily":
            daily_alerts.append(task_data)
        else:
            project_alerts.append(task_data)

    return {
        "as_of": cutoff.date().isoformat(),
        "daily": daily_alerts,
        "planned": project_alerts,
    }


@router.get("/alerts/settings")
def list_alert_settings(_admin: User = Depends(require_admin),
                        db: Session = Depends(get_db)):
    """
    Per-group alert thresholds. Each row reports the hardcoded default for the group
    plus the current override (if any) and the effective value being used.
    """
    rows = db.query(AppSetting).filter(AppSetting.key.like(_SETTING_KEY + "%")).all()
    overrides = {r.key.replace(_SETTING_KEY, ""): int(r.value) for r in rows if r.value is not None}
    template_counts = {
        rt: db.query(TaskTemplate).filter(TaskTemplate.repeat_type == rt).count()
        for rt in ALERT_GROUPS
    }
    groups = []
    for rt in ALERT_GROUPS:
        override = overrides.get(rt)
        groups.append({
            "repeat_type": rt,
            "default": DEFAULT_OVERDUE_ALERT_DAYS[rt],
            "override": override,
            "effective": override if override is not None else DEFAULT_OVERDUE_ALERT_DAYS[rt],
            "template_count": template_counts.get(rt, 0),
        })
    return {"groups": groups}


@router.put("/alerts/settings/{repeat_type}")
def update_alert_group(repeat_type: str,
                       overdue_alert_days: Optional[int] = None,
                       _admin: User = Depends(require_admin),
                       db: Session = Depends(get_db)):
    """
    Set (or clear, by omitting the param) the alert threshold for a repeat-type group.
    Without `overdue_alert_days` the group reverts to the hardcoded default.
    """
    _set_group_threshold(db, repeat_type, overdue_alert_days)
    db.commit()
    return {
        "repeat_type": repeat_type.lower(),
        "override": overdue_alert_days,
        "effective": _read_group_threshold(db, repeat_type),
    }


@router.post("/{task_id}/resolve")
def resolve_ai_flag(task_id: int, action: str,
                    _admin: User = Depends(require_admin),
                    db: Session = Depends(get_db)):
    """
    action: 'accept' (ignore AI and approve) or 'reject' (send back for rework)
    """
    task = db.query(Task).filter(Task.id == task_id).first()
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")
        
    if action == "accept":
        task.ai_status = "approved"
        task.ai_reasoning = "Flag dismissed manually by Admin."
    elif action == "reject":
        task.ai_status = "pending"
        task.status = "In Progress"
        task.ai_reasoning = "Rejected by Admin. Please redo."
    else:
        raise HTTPException(status_code=400, detail="Invalid action.")
        
    db.commit()
    return {"status": "success", "task_id": task_id, "ai_status": task.ai_status, "task_status": task.status}


@router.get("/insights")
async def generate_staff_insights(_admin: User = Depends(require_admin),
                                  db: Session = Depends(get_db)):
    """
    Generates AI insights based on the OVERDUE tasks (what is not being done).
    """
    from datetime import datetime, timezone
    
    now_utc = get_now()
    today_start = datetime(now_utc.year, now_utc.month, now_utc.day, tzinfo=BALI_TZ)
    
    overdue_tasks = db.query(Task).filter(
        Task.scheduled_date < today_start,
        Task.status != "Completed"
    ).all()
    
    if not overdue_tasks:
        return {"insights": ["Все задачи выполняются вовремя. Отличная работа!"]}
        
    class UserStat:
        def __init__(self, name: str):
            self.name = name
            self.daily_missed = 0
            self.planned_missed = 0
            
    user_stats: dict[int, UserStat] = {}
    from app.models.all import User
    
    for t in overdue_tasks:
        uid = t.assigned_user or 0
        if uid not in user_stats:
            u = db.query(User).filter(User.id == uid).first()
            user_stats[uid] = UserStat(u.name if u else "Unassigned")
            
        template = db.query(TaskTemplate).filter(TaskTemplate.id == t.template_id).first()
        is_daily = template and template.repeat_type == "daily"
        
        if is_daily:
            user_stats[uid].daily_missed += 1
        else:
            user_stats[uid].planned_missed += 1
            
    summary_text = "Сводка просроченных задач по персоналу (на сегодня):\n"
    for uid, stats in user_stats.items():
        summary_text += f"- Сотрудник: {stats.name} | Ежедневных просрочено: {stats.daily_missed} | Проектных просрочено: {stats.planned_missed}\n"
            
    m = [
        {
            "role": "system",
            "content": (
                "You are an expert HR and Operations AI assistant for a hotel/facility manager. "
                "Analyze the provided list of overdue/missed tasks. "
                "Highlight critical bottlenecks, who is struggling the most, and formulate exactly "
                "3-4 concise, actionable insight bullet points FOR THE MANAGER IN RUSSIAN language. "
                "For example: 'Алексею нужно напомнить про ежедневки, они копятся уже 3 дня.' "
                "Do not include pleasantries. Return ONLY valid JSON: {'insights': ['insight 1', 'insight 2', ...]}"
            )
        },
        {
            "role": "user",
            "content": summary_text
        }
    ]
    
    api_key = os.environ.get("OPENAI_API_KEY")
    if not api_key:
        return {"insights": ["OpenAI API key missing. Cannot generate insights."]}
        
    try:
        async with httpx.AsyncClient(timeout=30.0) as client:
            response = await client.post(
                "https://api.openai.com/v1/chat/completions",
                headers={"Authorization": f"Bearer {api_key}"},
                json={
                    "model": "gpt-4o-mini",
                    "messages": m,
                    "response_format": {"type": "json_object"},
                    "max_tokens": 500,
                    "temperature": 0.5
                }
            )
            
            if response.status_code == 200:
                result_json = response.json()
                content = result_json["choices"][0]["message"]["content"]
                import json
                parsed = json.loads(content)
                return {"insights": parsed.get("insights", ["No insights could be parsed."])}
            else:
                return {"insights": [f"OpenAI API Error: {response.status_code}"]}
    except Exception as e:
        logger.error(f"Error generating insights: {e}")
        return {"insights": [f"Internal error generating insights: {str(e)}"]}
