from fastapi import APIRouter, Depends, HTTPException, BackgroundTasks
from sqlalchemy.orm import Session
from app.core.database import get_db
from app.models.all import Task, TaskPhoto, TaskTemplate
import os
import json
import httpx
import logging

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


@router.get("/recommendations")
def get_ai_recommendations(db: Session = Depends(get_db)):
    """
    Returns tasks that have been 'flagged' by the AI for Admin review.
    """
    flagged_tasks = db.query(Task).filter(Task.ai_status == "flagged").order_by(Task.scheduled_date.desc()).all()
    
    result = []
    for t in flagged_tasks:
        photos = db.query(TaskPhoto).filter(TaskPhoto.task_id == t.id).all()
        from app.models.all import User
        user = db.query(User).filter(User.id == t.assigned_user).first()
        template = db.query(TaskTemplate).filter(TaskTemplate.id == t.template_id).first()
        
        result.append({
            "task_id": t.id,
            "task_name": template.name if template else "Unknown Task",
            "task_status": t.status,
            "ai_status": t.ai_status,
            "ai_reasoning": t.ai_reasoning,
            "assigned_user_name": user.name if user else "Unassigned",
            "scheduled_date": t.scheduled_date.isoformat() if t.scheduled_date else None,
            "photos": [{"id": p.id, "url": p.url} for p in photos]
        })
        
    return result

@router.post("/{task_id}/resolve")
def resolve_ai_flag(task_id: int, action: str, db: Session = Depends(get_db)):
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
async def generate_staff_insights(db: Session = Depends(get_db)):
    """
    On-demand AI generation of staff recommendations based on recent task validations.
    """
    from datetime import datetime, timedelta, timezone
    
    seven_days_ago = datetime.now(timezone.utc) - timedelta(days=7)
    recent_tasks = db.query(Task).filter(Task.scheduled_date >= seven_days_ago, Task.status == "Completed").all()
    
    if not recent_tasks:
        return {"insights": ["Not enough data in the last 7 days to generate meaningful insights."]}
        
    # Group by user
    class UserStat:
        def __init__(self, name: str):
            self.name = name
            self.total = 0
            self.flagged = 0
            self.reasons = []
            
    user_stats: dict[int, UserStat] = {}
    from app.models.all import User
    
    for t in recent_tasks:
        if not t.assigned_user:
            continue
            
        if t.assigned_user not in user_stats:
            u = db.query(User).filter(User.id == t.assigned_user).first()
            user_stats[t.assigned_user] = UserStat(u.name if u else f"User {t.assigned_user}")
            
        user_stats[t.assigned_user].total += 1
        if t.ai_status == "flagged":
            user_stats[t.assigned_user].flagged += 1
            if t.ai_reasoning:
                user_stats[t.assigned_user].reasons.append(t.ai_reasoning)
                
    # Build prompt
    summary_text = "Weekly Staff Performance Summary:\n"
    for uid, stats in user_stats.items():
        summary_text += f"- {stats.name}: {stats.total} tasks completed, {stats.flagged} flagged by AI.\n"
        if stats.reasons:
            # Take a sample of reasons to avoid token bloat
            sample_reasons = stats.reasons[:5]
            summary_text += f"  Common flagged issues: {', '.join(sample_reasons)}\n"
            
    m = [
        {
            "role": "system",
            "content": (
                "You are an expert HR and Operations AI assistant. "
                "Analyze the provided weekly task performance data for the staff. "
                "Look for negative trends (e.g., high flag rates, recurring specific issues) and positive patterns. "
                "Return exactly 3-4 concise, actionable insight bullet points for the manager. "
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
                    "model": "gpt-4o-mini", # Used mini for faster/cheaper text analysis
                    "messages": m,
                    "response_format": {"type": "json_object"},
                    "max_tokens": 500,
                    "temperature": 0.5
                }
            )
            
            if response.status_code == 200:
                result_json = response.json()
                content = result_json["choices"][0]["message"]["content"]
                parsed = json.loads(content)
                return {"insights": parsed.get("insights", ["No insights could be parsed."])}
            else:
                return {"insights": [f"OpenAI API Error: {response.status_code}"]}
    except Exception as e:
        logger.error(f"Error generating insights: {e}")
        return {"insights": [f"Internal error generating insights: {str(e)}"]}
