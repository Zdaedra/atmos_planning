from fastapi import APIRouter, Depends, HTTPException, File, UploadFile, Body, BackgroundTasks
from typing import List, Optional
import io
from sqlalchemy.orm import Session, joinedload
import pandas as pd
import re
from datetime import datetime, timedelta, timezone
import base64
import uuid
from PIL import Image, ImageOps

from app.core.database import get_db
from app.models.all import Task, TaskTemplate, User, Zone, TaskComment, TaskPhoto, SystemMessage
from app.schemas.task import TaskCreate, TaskResponse, TaskTemplateCreate, TaskTemplateResponse, TaskImportRequest, TaskWithTemplateResponse, TaskCompleteRequest, TaskRevertRequest
from pydantic import BaseModel
from sqlalchemy import or_, and_
from pydantic import BaseModel
from app.core.storage import get_minio_client, MINIO_BUCKET
from app.api.ai import verify_task_photos_ai

# For simplicity in this step, not adding full auth dependency to every route yet, but the structure is here.
router = APIRouter()

class TaskAssignRequest(BaseModel):
    user_id: int
    template_id: int
    scheduled_date: Optional[str] = None
    assign_all: bool = False

@router.post("/assign")
def assign_task(req: TaskAssignRequest, db: Session = Depends(get_db)):
    template = db.query(TaskTemplate).filter(TaskTemplate.id == req.template_id).first()
    if not template:
        raise HTTPException(status_code=404, detail="Template not found")
        
    if req.assign_all:
        template.default_assigned_user = req.user_id
        db.add(template)
        # Re-assign any existing uncompleted tasks to this user
        now = datetime.now(timezone.utc)
        today_start = datetime(now.year, now.month, now.day, 0, 0, tzinfo=timezone.utc)
        future_tasks = db.query(Task).filter(
            Task.template_id == req.template_id,
            Task.status.in_(["Planned", "Overdue"])
        ).all()
        for t in future_tasks:
            t.assigned_user = req.user_id
        db.commit()
        
        notify_msg = SystemMessage(user_id=req.user_id, text=f"Вам назначена регулярная персональная задача: {template.name}")
        db.add(notify_msg)
        db.commit()
        return {"status": "success", "message": f"Assigned to all instances. Updated {len(future_tasks)} existing tasks."}
    else:
        if not req.scheduled_date:
            raise HTTPException(status_code=400, detail="scheduled_date required for single assignment")
            
        target_date = datetime.fromisoformat(req.scheduled_date.replace("Z", "+00:00"))
        start_of_target = datetime(target_date.year, target_date.month, target_date.day, 0, 0, tzinfo=timezone.utc)
        end_of_target = start_of_target + timedelta(days=1)
        
        existing_task = db.query(Task).filter(
            Task.template_id == req.template_id,
            Task.scheduled_date >= start_of_target,
            Task.scheduled_date < end_of_target
        ).first()
        
        if existing_task:
            existing_task.assigned_user = req.user_id
        else: # if not existing_task
            new_task = Task(
                template_id=req.template_id,
                zone_id=template.zone_id,
                assigned_user=req.user_id,
                scheduled_date=start_of_target,
                status="Planned",
                priority="normal"
            )
            db.add(new_task)

        db.commit()
        
        notify_msg = SystemMessage(user_id=req.user_id, text=f"Вам назначена новая персональная задача на {start_of_target.strftime('%d.%m.%Y')}: {template.name}")
        db.add(notify_msg)
        db.commit()
        return {"status": "success", "message": "Assigned for specific date."}

class TaskUnassignRequest(BaseModel):
    user_id: int
    template_id: int
    scheduled_date: Optional[str] = None
    unassign_all: bool = False

@router.post("/unassign")
def unassign_task(req: TaskUnassignRequest, db: Session = Depends(get_db)):
    template = db.query(TaskTemplate).filter(TaskTemplate.id == req.template_id).first()
    if not template:
        raise HTTPException(status_code=404, detail="Template not found")
        
    if req.unassign_all:
        if template.default_assigned_user == req.user_id:
            template.default_assigned_user = None
            db.add(template)
            
        future_tasks = db.query(Task).filter(
            Task.template_id == req.template_id,
            Task.assigned_user == req.user_id,
            Task.status.in_(["Planned", "Overdue"])
        ).all()
        for t in future_tasks:
            t.assigned_user = None
        db.commit()
        return {"status": "success", "message": f"Unassigned globally. Removed user from {len(future_tasks)} tasks."}
    else:
        if not req.scheduled_date:
            raise HTTPException(status_code=400, detail="scheduled_date required for single unassignment")
            
        target_date = datetime.fromisoformat(req.scheduled_date.replace("Z", "+00:00"))
        start_of_target = datetime(target_date.year, target_date.month, target_date.day, 0, 0, tzinfo=timezone.utc)
        end_of_target = start_of_target + timedelta(days=1)
        
        # Delete instantiated target task for explicit date matching
        existing_task = db.query(Task).filter(
            Task.template_id == req.template_id,
            Task.assigned_user == req.user_id,
            Task.scheduled_date >= start_of_target,
            Task.scheduled_date < end_of_target
        ).first()
        
        if existing_task:
            if existing_task.status == "Completed":
                raise HTTPException(status_code=400, detail="Cannot unassign a completed task")
            db.delete(existing_task)
            db.commit()
            return {"status": "success", "message": "Task instance deleted and unassigned."}
        else:
            return {"status": "success", "message": "No specific task mapped for this date."}

@router.post("/templates/unassign-all-global")
def unassign_all_global(db: Session = Depends(get_db)):
    """
    Destructive endpoint that removes ALL assigned users and next_execution_dates from ALL templates,
    and also unassigns ALL future Planned tasks so that statistics are not affected for past overdue/completed tasks.
    """
    now = datetime.now(timezone.utc)
    
    # 1. Clear scheduled definitions (EXCLUDING daily templates, which must remain assigned to supervisors structurally)
    db.query(TaskTemplate).filter(
        func.lower(TaskTemplate.repeat_type) != "daily"
    ).update({
        TaskTemplate.default_assigned_user: None,
        TaskTemplate.next_execution_date: None
    }, synchronize_session=False)
    
    # 2. Clear uncompleted future generated instances safely bypassing Overdue and Daily tasks
    planned_tasks_query = db.query(Task.id).outerjoin(TaskTemplate, Task.template_id == TaskTemplate.id).filter(
        Task.status == "Planned",
        or_(TaskTemplate.id == None, func.lower(TaskTemplate.repeat_type) != "daily")
    )
    planned_task_ids = planned_tasks_query.all()
    if planned_task_ids:
        ids_to_del = [t.id for t in planned_task_ids]
        
        # Manually cascade delete dependent rows to avoid PostgreSQL IntegrityError
        db.query(TaskComment).filter(TaskComment.task_id.in_(ids_to_del)).delete(synchronize_session=False)
        db.query(TaskPhoto).filter(TaskPhoto.task_id.in_(ids_to_del)).delete(synchronize_session=False)
        
        # Finally delete uncompleted Tasks themselves
        db.query(Task).filter(Task.id.in_(ids_to_del)).delete(synchronize_session=False)

    db.commit()
    return {"status": "success", "message": "All future tasks have been globally unassigned."}


@router.post("/templates/", response_model=TaskTemplateResponse)
def create_template(template: TaskTemplateCreate, db: Session = Depends(get_db)):
    db_template = TaskTemplate(**template.model_dump())
    db.add(db_template)
    db.commit()
    db.refresh(db_template)
    
    # If it's a project and the date is today, generate a Task immediately
    if db_template.repeat_type == "project" and db_template.next_execution_date:
        now = datetime.now(timezone.utc)
        today_start = datetime(now.year, now.month, now.day, 0, 0, tzinfo=timezone.utc)
        
        if db_template.next_execution_date.date() == today_start.date():
            new_task = Task(
                template_id=db_template.id,
                zone_id=db_template.zone_id,
                assigned_user=None,
                scheduled_date=now,
                status="Planned",
                priority="normal"
            )
            db.add(new_task)
            db_template.last_generated_date = now
            db.commit()
            
    return db_template

@router.get("/templates/", response_model=List[TaskTemplateResponse])
def get_templates(skip: int = 0, limit: int = 1000, db: Session = Depends(get_db)):
    return db.query(TaskTemplate).offset(skip).limit(limit).all()

@router.put("/templates/{template_id}", response_model=TaskTemplateResponse)
def update_template(template_id: int, template_in: TaskTemplateCreate, db: Session = Depends(get_db)):
    db_template = db.query(TaskTemplate).filter(TaskTemplate.id == template_id).first()
    if not db_template:
        raise HTTPException(status_code=404, detail="Template not found")
        
    old_date = db_template.next_execution_date
    
    for var, value in vars(template_in).items():
        setattr(db_template, var, value)
        
    db.commit()
    db.refresh(db_template)
    
    # UX Sync: If the scheduled date changed (either to a new date, or to None)
    if db_template.next_execution_date != old_date:
        # Since the schedule changed, remove any currently Planned/Overdue 
        # instances so they don't get left behind on old dates.
        if old_date:
            tasks_to_delete = db.query(Task).filter(
                Task.template_id == db_template.id,
                Task.status.in_(["Planned", "Overdue"])
            ).all()
            ids_to_del = [t.id for t in tasks_to_delete]
            if ids_to_del:
                db.query(TaskComment).filter(TaskComment.task_id.in_(ids_to_del)).delete(synchronize_session=False)
                db.query(TaskPhoto).filter(TaskPhoto.task_id.in_(ids_to_del)).delete(synchronize_session=False)
                db.query(Task).filter(Task.id.in_(ids_to_del)).delete(synchronize_session=False)
                db.commit()
                
        # If there's a new explicit date, instantiate the new mapping
        if db_template.next_execution_date:
            target_dt = db_template.next_execution_date
            start_of_day = datetime(target_dt.year, target_dt.month, target_dt.day, 0, 0, tzinfo=timezone.utc)
            end_of_day = start_of_day + timedelta(days=1)
            
            existing = db.query(Task).filter(
                Task.template_id == db_template.id,
                Task.scheduled_date >= start_of_day,
                Task.scheduled_date < end_of_day
            ).first()
            
            if not existing:
                new_task = Task(
                    template_id=db_template.id,
                    zone_id=db_template.zone_id,
                    assigned_user=db_template.default_assigned_user,
                    scheduled_date=db_template.next_execution_date,
                    status="Planned",
                    priority="normal"
                )
                db.add(new_task)
                db.commit()
            
    return db_template

@router.delete("/templates/bulk")
def delete_templates_bulk(template_ids: List[int] = Body(...), db: Session = Depends(get_db)):
    """
    Bulk delete Task Templates by passing a list of their integer IDs in the JSON body.
    """
    if not template_ids:
        raise HTTPException(status_code=400, detail="No template IDs provided")
        
    db_templates = db.query(TaskTemplate).filter(TaskTemplate.id.in_(template_ids)).all()
    count = len(db_templates)
    for tmpl in db_templates:
        task_ids_query = db.query(Task.id).filter(Task.template_id == tmpl.id)
        task_ids = [r[0] for r in task_ids_query.all()]
        if task_ids:
            db.query(TaskComment).filter(TaskComment.task_id.in_(task_ids)).delete(synchronize_session=False)
            db.query(TaskPhoto).filter(TaskPhoto.task_id.in_(task_ids)).delete(synchronize_session=False)
            db.query(Task).filter(Task.template_id == tmpl.id).delete(synchronize_session=False)
        db.delete(tmpl)
        
    db.commit()
    return {"message": f"Successfully deleted {count} rule(s)."}

@router.delete("/templates/{template_id}")
def delete_template(template_id: int, db: Session = Depends(get_db)):
    db_template = db.query(TaskTemplate).filter(TaskTemplate.id == template_id).first()
    if not db_template:
        raise HTTPException(status_code=404, detail="Template not found")
        
    task_ids_query = db.query(Task.id).filter(Task.template_id == template_id)
    task_ids = [r[0] for r in task_ids_query.all()]
    if task_ids:
        db.query(TaskComment).filter(TaskComment.task_id.in_(task_ids)).delete(synchronize_session=False)
        db.query(TaskPhoto).filter(TaskPhoto.task_id.in_(task_ids)).delete(synchronize_session=False)
        db.query(Task).filter(Task.template_id == template_id).delete(synchronize_session=False)

    db.delete(db_template)
    db.commit()
    return {"ok": True}

@router.post("/templates/import-ai", response_model=dict)
async def import_templates_ai(file: UploadFile = File(...), db: Session = Depends(get_db)):
    """
    Smart Heuristic AI CSV parsing endpoint.
    Automatically detects columns and types from uploaded files.
    """
    if not file.filename.endswith(('.csv', '.txt', '.xls', '.xlsx')):
        raise HTTPException(status_code=400, detail="Only .csv, .txt, .xls, or .xlsx files are supported for import.")
        
    contents = await file.read()
    
    # Process Excel files
    if file.filename.endswith(('.xls', '.xlsx')):
        try:
            df = pd.read_excel(io.BytesIO(contents))
            # Convert NaN to empty strings
            df = df.fillna('')
            # Output to tab-separated string
            text = df.to_csv(sep='\t', index=False, header=True)
        except Exception as e:
            raise HTTPException(status_code=400, detail=f"Failed to parse Excel file: {str(e)}")
    else:
        # Process CSV/TXT
        try:
            if isinstance(contents, bytes):
                text = contents.decode("utf-8")
            else:
                text = str(contents)
        except UnicodeDecodeError:
            # Fallback to Latin-1 or cp1251 for russian systems
            if isinstance(contents, bytes):
                text = contents.decode("cp1251", errors="ignore")
            else:
                text = str(contents)
        
    lines = text.strip().split("\n")
    if not lines:
        return {"message": "No data found."}

    # Detect delimiter
    first_line = lines[0]
    delimiter = "\t"
    for d in ["\t", "|", ",", ";"]:
        if d in first_line:
            delimiter = d
            break

    # Parse all rows
    raw_rows = [line.split(delimiter) for line in lines if line.strip()]
    if not raw_rows:
        return {"message": "No clear rows found."}

    # Strip whitespace into typed list
    rows: list[list[str]] = []
    for r in raw_rows:
        rows.append([col.strip() for col in r])

    # Ensure all rows have the same number of columns by padding with empty strings
    if rows:
        max_cols = max(len(r) for r in rows)
        for r in rows:
            while len(r) < max_cols:
                r.append("")

    # Heuristic Column Detection
    col_map = {"name": -1, "desc": -1, "freq": -1, "zone": -1, "time": -1}

    # 1. Try to detect by header row
    header: list[str] = [str(h).lower().strip() for h in rows[0]]
    for i, h in enumerate(header):
        if any(word in h for word in ["name", "task", "title", "what", "описание", "задача", "имя", "название", "rule"]):
            col_map["name"] = i
        if any(word in h for word in ["desc", "detail", "info", "инструкция", "подробност", "instruction", "optional"]):
            col_map["desc"] = i
        if any(word in h for word in ["freq", "repeat", "when", "частота", "период", "frequency"]):
            col_map["freq"] = i
        if any(word in h for word in ["zone", "loc", "where", "зона", "локация", "место", "assigned"]):
            col_map["zone"] = i
        if any(word in h for word in ["time", "время", "смена", "утро", "вечер", "day"]):
            col_map["time"] = i

    has_header = False
    if sum(1 for v in col_map.values() if v != -1) >= 1:
        has_header = True
        rows.pop(0)  # Skip header row

    # 2. If header detection failed, infer by data types across the first data row
    if not has_header and len(rows) > 0:
        sample_row: list[str] = [str(c).strip() for c in rows[0]]
        max_len_idx = -1
        second_max_len_idx = -1
        max_len = -1
        second_max_len = -1
        
        for i, val in enumerate(sample_row):
            val_lower = val.lower()
            if not val_lower: continue
            
            # Detect frequency
            if val_lower in ["daily", "weekly", "biweekly", "monthly", "ежедневно", "раз в неделю", "две недели", "раз в 2 недели", "раз в месяц", "каждый день"]:
                col_map["freq"] = i
                continue
            
            # Detect time of day
            if val_lower in ["1", "2", "shift 1", "shift 2", "shift1", "shift2", "смена 1", "смена 2", "смена1", "смена2", "morning", "evening", "утро", "утром", "вечер", "вечером", "anytime", "любое", "не важно"] and col_map["time"] == -1:
                col_map["time"] = i
                continue
            
            # Detect zone (if numeric)
            if val.isdigit() and col_map["zone"] == -1:
                col_map["zone"] = i
                continue
                
            # Track longest text for name and second longest for description
            v_len = len(val)
            if v_len > max_len:
                second_max_len = max_len
                second_max_len_idx = max_len_idx
                max_len = v_len
                max_len_idx = i
            elif v_len > second_max_len:
                second_max_len = v_len
                second_max_len_idx = i
                
        if col_map["name"] == -1 and max_len_idx != -1:
            col_map["name"] = max_len_idx
        if col_map["desc"] == -1 and second_max_len_idx != -1:
            col_map["desc"] = second_max_len_idx

    # Set defaults if still not found
    if col_map["name"] == -1: 
        # Attempt to find the first non-empty column that isn't mapped to anything else
        mapped_cols = [c for c in col_map.values() if c != -1]
        for i in range(len(rows[0]) if rows else 0):
            if i not in mapped_cols:
                col_map["name"] = i
                break
        if col_map["name"] == -1: col_map["name"] = 0
        
    # User's excel has "zone" column header but might be empty. If col_map["zone"] mapped to an empty column, it's fine.
    # We DO NOT want to guess the Zone index if the header didn't specify it, because we'll just pull bad data.
    # Leave it as -1 if not found.

    # Similarly for freq and time, leave as -1 if not explicitly matched, so we don't accidentally grab the task name.

    imported_count = 0
    for row in rows:
        if not row: continue
        
        # Safely extract with typed index
        r_list: list[str] = [str(c).strip() for c in list(row)]
        row_joined_lower = " ".join(r_list).lower()
        if not row_joined_lower.strip() or row_joined_lower.replace("nan", "").strip() == "":
            continue
            
        freq_raw = "daily"
        time_raw = "anytime"
        zone_str = ""
        name = ""
        desc = ""
        
        # 1. Identify frequency
        freq_mapped_idx = -1
        for idx, val in enumerate(r_list):
            v_low = val.lower()
            if any(w in v_low for w in ["biweekly", "bi weekly", "by weekly", "byweekly", "две недели", "2 недели", "weekly", "week", "недел", "monthly", "month", "месяц", "project", "проект", "daily", "day", "день", "ежедневно"]):
                freq_raw = v_low
                freq_mapped_idx = idx
                break
                
        # 2. Identify time
        time_mapped_idx = -1
        for idx, val in enumerate(r_list):
            if idx == freq_mapped_idx: continue
            v_low = val.lower()
            if any(w in v_low for w in ["смена", "shift", "1", "2", "morning", "утр", "evening", "вечер", "night", "ночь", "anytime", "любое"]):
                time_raw = v_low
                time_mapped_idx = idx
                break
                
        # 3. Identify zone (numeric or explicitly labeled)
        zone_mapped_idx = -1
        for idx, val in enumerate(r_list):
            if idx in (freq_mapped_idx, time_mapped_idx): continue
            if val.isdigit() or (val.lower().startswith("zone") and any(c.isdigit() for c in val)):
                zone_str = val
                zone_mapped_idx = idx
                break
                
        # 4. Identify task name (longest remaining string)
        max_len = -1
        for idx, val in enumerate(r_list):
            if idx in (freq_mapped_idx, time_mapped_idx, zone_mapped_idx): continue
            if val.lower() == "nan" or not val.strip(): continue
            if len(val) > max_len:
                name = val
                max_len = len(val)
                
        if not name:
            # Fallback if no string was long enough or all were consumed
            for idx, val in enumerate(r_list):
                if val.strip() and val.lower() != "nan":
                    name = val
                    break
                    
        if not name:
            continue
        
        # Normalize Frequency
        freq = "daily"
        if any(w in freq_raw for w in ["biweekly", "bi weekly", "by weekly", "byweekly", "две недели", "2 недели"]): freq = "biweekly"
        elif any(w in freq_raw for w in ["weekly", "week", "недел"]): freq = "weekly"
        elif any(w in freq_raw for w in ["monthly", "month", "месяц"]): freq = "monthly"
        elif any(w in freq_raw for w in ["project", "проект"]): freq = "project"
        
        # Normalize Time of Day
        time_of_day = "anytime"
        if any(w in time_raw for w in ["1", "morning", "утр"]): time_of_day = "1"
        elif any(w in time_raw for w in ["2", "evening", "вечер", "night", "ночь"]): time_of_day = "2"
        
        zone_id = 1
        try:
            if str(zone_str).strip():
                # Extract the first integer found in the zone string (e.g. "Zone 1 (Main Hall)" -> 1)
                match = re.search(r'\d+', str(zone_str))
                parsed_zone_id = int(match.group()) if match else 1
                
                zone = db.query(Zone).filter(Zone.id == parsed_zone_id).first()
                if zone:
                    zone_id = parsed_zone_id
                else:
                    first_zone = db.query(Zone).first()
                    if first_zone: zone_id = first_zone.id
            else:
                first_zone = db.query(Zone).first()
                if first_zone: zone_id = first_zone.id
        except Exception:
            first_zone = db.query(Zone).first()
            if first_zone: zone_id = first_zone.id
            
        safe_name = str(name)
        db_template = TaskTemplate(
            name=safe_name[:200], # max length protection
            description=desc,
            zone_id=zone_id,
            repeat_type=freq,
            time_of_day=time_of_day,
            photo_required=False
        )
        db.add(db_template)
        imported_count += 1
        
    db.commit()
    return {"message": f"Successfully imported {imported_count} tasks using Smart AI parser."}

@router.post("/", response_model=TaskResponse)
def create_task(task: TaskCreate, db: Session = Depends(get_db)):
    db_task = Task(**task.model_dump())
    db.add(db_task)
    db.commit()
    db.refresh(db_task)
    return db_task
from sqlalchemy.orm import joinedload
from sqlalchemy import or_, and_, func

from typing import Optional

@router.get("/", response_model=List[TaskWithTemplateResponse])
def get_tasks(status: Optional[str] = None, assigned_user: Optional[int] = None, limit: int = 100, db: Session = Depends(get_db)):
    query = db.query(Task).options(
        joinedload(Task.template),
        joinedload(Task.photos)
    )
    if status and status != "all":
        query = query.filter(Task.status == status)
    if assigned_user is not None:
        query = query.filter(Task.assigned_user == assigned_user)
        
    tasks = query.order_by(Task.scheduled_date.asc()).limit(limit).all()
    return tasks

@router.get("/failed", response_model=List[TaskWithTemplateResponse])
def get_failed_tasks(db: Session = Depends(get_db)):
    tasks = db.query(Task).options(
        joinedload(Task.template),
        joinedload(Task.photos)
    ).filter(
        or_(
            Task.status == "Overdue",
            Task.ai_status == "Rejected"
        )
    ).order_by(Task.scheduled_date.desc(), Task.id.desc()).all()
    return tasks

@router.post("/", response_model=TaskResponse)
def create_task(task: TaskCreate, db: Session = Depends(get_db)):
    db_task = Task(**task.model_dump())
    db.add(db_task)
    db.commit()
    db.refresh(db_task)
    return db_task

@router.get("/user/{user_id}", response_model=List[TaskWithTemplateResponse])
def get_user_tasks(user_id: int, db: Session = Depends(get_db)):
    # Get active/planned tasks + ONLY completed tasks for today
    now = datetime.now(timezone.utc)
    today_start = datetime(now.year, now.month, now.day, 0, 0, tzinfo=timezone.utc)
    tomorrow_start = today_start + timedelta(days=1)
    
    return db.query(Task).options(joinedload(Task.template)).join(TaskTemplate, Task.template_id == TaskTemplate.id).filter(
        or_(
            Task.assigned_user == None,
            Task.assigned_user == user_id
        ),
        or_(
            Task.status.in_(["Planned", "Overdue", "In Progress"]),
            and_(Task.status == "Completed", TaskTemplate.last_completed_at >= today_start, TaskTemplate.last_completed_at < tomorrow_start)
        )
    ).all()

@router.patch("/{task_id}/status", response_model=TaskResponse)
def update_task_status(task_id: int, status: str, comment: str = None, user_id: int = None, db: Session = Depends(get_db)):
    db_task = db.query(Task).filter(Task.id == task_id).first()
    if not db_task:
        raise HTTPException(status_code=404, detail="Task not found")
    
    db_task.status = status
    if user_id:
        db_task.assigned_user = user_id
    
    # Store comment if provided
    if comment and comment.strip():
        new_comment = TaskComment(
            task_id=db_task.id,
            user_id=user_id or db_task.assigned_user, # Uses provided user_id or existing if claimed
            text=comment.strip()
        )
        db.add(new_comment)
    
    
    if status.lower() in ["done", "completed"]:
        print(f"DEBUG: Task {task_id} marked as {status.lower()}, retrieving Template {db_task.template_id}", flush=True)
        template = db.query(TaskTemplate).filter(TaskTemplate.id == db_task.template_id).first()
        if template:
            now = datetime.now(timezone.utc)
            template.last_completed_at = now
            print(f"DEBUG: Setting Template {template.id} last_completed_at to {now}", flush=True)
            rpt = (template.repeat_type or "").lower()
            if rpt == "daily":
                template.next_execution_date = now + timedelta(days=1)
            elif rpt == "weekly":
                template.next_execution_date = now + timedelta(days=7)
            elif rpt == "biweekly":
                template.next_execution_date = now + timedelta(days=14)
            elif rpt == "monthly":
                template.next_execution_date = now + timedelta(days=28)
            
            db.add(template) # Explicitly add to session just in case
            print(f"DEBUG: Scheduled Template {template.id} next_execution_date for {template.next_execution_date}", flush=True)
        else:
            print(f"DEBUG: ERROR! Template {db_task.template_id} not found!", flush=True)
            
    db.commit()
    db.refresh(db_task)
    return db_task

@router.get("/{task_id}/report")
def get_task_report(task_id: int, db: Session = Depends(get_db)):
    db_task = db.query(Task).filter(Task.id == task_id).first()
    if not db_task:
        raise HTTPException(status_code=404, detail="Task not found")
        
    photos = db.query(TaskPhoto).filter(TaskPhoto.task_id == task_id).all()
    comments = db.query(TaskComment).filter(TaskComment.task_id == task_id).order_by(TaskComment.created_at.desc()).all()
    
    return {
        "task_id": task_id,
        "photos": [{"id": p.id, "url": p.url, "created_at": p.created_at} for p in photos],
        "comments": [{"id": c.id, "text": c.text, "created_at": c.created_at, "user_id": c.user_id} for c in comments]
    }

@router.post("/system/generate-daily")
def generate_daily_tasks(db: Session = Depends(get_db)):
    templates = db.query(TaskTemplate).all()
    
    # Get local current time
    now = datetime.now(timezone.utc)
    today_start = datetime(now.year, now.month, now.day, 0, 0, tzinfo=timezone.utc)
    
    created_count = 0
    for tmpl in templates:
        # Skip if we already generated a task for this template today (only applies to Daily)
        if tmpl.last_generated_date and tmpl.last_generated_date >= today_start:
            if (tmpl.repeat_type or "daily").lower() == "daily":
                continue
            
        freq = (tmpl.repeat_type or "daily").lower()
        needs_run = False
        
        if freq == "daily":
            needs_run = True
        else:
            if tmpl.next_execution_date and today_start.date() >= tmpl.next_execution_date.date():
                needs_run = True
                
        if needs_run:
            # Determine the exact intended date this task should have been run
            target_date = today_start if freq == "daily" else (tmpl.next_execution_date or today_start)
            target_date_start = datetime(target_date.year, target_date.month, target_date.day, 0, 0, tzinfo=timezone.utc)
            target_date_end = target_date_start + timedelta(days=1)

            # Check if there's already a task scheduled for this exact calendar date
            existing = db.query(Task).filter(
                Task.template_id == tmpl.id,
                Task.scheduled_date >= target_date_start,
                Task.scheduled_date < target_date_end
            ).first()
            
            if not existing:
                schedule_dt = now if freq == "daily" else target_date
                
                new_task = Task(
                    template_id=tmpl.id,
                    zone_id=tmpl.zone_id,
                    assigned_user=tmpl.default_assigned_user,
                    scheduled_date=schedule_dt,
                    status="Planned",
                    priority="normal"
                )
                db.add(new_task)
                
                # Update last_generated_date
                tmpl.last_generated_date = now
                
                # Advance next_execution_date for the future generators bridging math
                if tmpl.next_execution_date:
                    if freq == "weekly":
                        tmpl.next_execution_date += timedelta(days=7)
                    elif freq == "biweekly":
                        tmpl.next_execution_date += timedelta(days=14)
                    elif freq == "monthly":
                        tmpl.next_execution_date += timedelta(days=28)
                    
                created_count += 1
                
    db.commit()
    return {"status": "success", "generated_count": created_count}

@router.post("/{task_id}/complete", response_model=TaskResponse)
def complete_task(task_id: int, req: TaskCompleteRequest, background_tasks: BackgroundTasks, db: Session = Depends(get_db)):
    db_task = db.query(Task).filter(Task.id == task_id).first()
    if not db_task:
        raise HTTPException(status_code=404, detail="Task not found")
        
    db_task.status = "Completed"
    
    # Store comment
    if req.comments and req.comments.strip():
        db.add(TaskComment(task_id=db_task.id, user_id=db_task.assigned_user, text=req.comments.strip()))
        
    # Process base64 photo
    if req.photo_data_base64:
        header, encoded = req.photo_data_base64.split(",", 1) if "," in req.photo_data_base64 else ("", req.photo_data_base64)
        try:
            file_bytes = base64.b64decode(encoded)
            image = Image.open(io.BytesIO(file_bytes))
            image = ImageOps.exif_transpose(image)
            if image.mode != "RGB":
                image = image.convert("RGB")
                
            max_width = 800
            if image.width > max_width:
                ratio = max_width / image.width
                image = image.resize((max_width, int(image.height * ratio)), Image.Resampling.LANCZOS)
                
            img_byte_arr = io.BytesIO()
            image.save(img_byte_arr, format='JPEG', quality=65, optimize=True)
            img_byte_arr.seek(0)
            
            client = get_minio_client()
            unique_filename = f"{task_id}_{uuid.uuid4().hex}.jpg"
            client.put_object(
                MINIO_BUCKET,
                unique_filename,
                img_byte_arr,
                length=img_byte_arr.getbuffer().nbytes,
                content_type="image/jpeg"
            )
            file_url = f"https://api.trypranaextract.com/{MINIO_BUCKET}/{unique_filename}"
            db.add(TaskPhoto(task_id=task_id, url=file_url))
        except Exception as e:
            print(f"Error processing base64 image: {e}")
            
    # Trigger AI verification background payload
    background_tasks.add_task(verify_task_photos_ai, task_id)
            
    # Update template execution metrics
    template = db.query(TaskTemplate).filter(TaskTemplate.id == db_task.template_id).first()
    if template:
        now = datetime.now(timezone.utc)
        template.last_completed_at = now
        rpt = (template.repeat_type or "").lower()
        if rpt == "daily":
            template.next_execution_date = now + timedelta(days=1)
        elif rpt == "weekly":
            template.next_execution_date = now + timedelta(days=7)
        elif rpt == "biweekly":
            template.next_execution_date = now + timedelta(days=14)
        elif rpt == "monthly":
            template.next_execution_date = now + timedelta(days=28)
            
    db.commit()
    db.refresh(db_task)
    return db_task

@router.post("/{task_id}/revert", response_model=TaskResponse)
def revert_task(task_id: int, req: TaskRevertRequest, db: Session = Depends(get_db)):
    db_task = db.query(Task).filter(Task.id == task_id).first()
    if not db_task:
        raise HTTPException(status_code=404, detail="Task not found")
        
    db_task.status = "Planned"
    
    if req.comments and req.comments.strip():
        db.add(TaskComment(task_id=db_task.id, user_id=db_task.assigned_user, text=f"Reverted: {req.comments.strip()}"))
        
    db.commit()
    db.refresh(db_task)
    return db_task

@router.get("/calendar")
def get_calendar(start_date: str, end_date: str, user_id: Optional[int] = None, db: Session = Depends(get_db)):
    """
    Unified Endpoint generating accurate timeline projection arrays securely.
    Returns: { "YYYY-MM-DD": [ ...tasks/templates... ] }
    """
    try:
        start_dt = datetime.strptime(start_date, "%Y-%m-%d").replace(tzinfo=timezone.utc)
        end_dt = datetime.strptime(end_date, "%Y-%m-%d").replace(tzinfo=timezone.utc)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid date format, use YYYY-MM-DD")

    tasks_query = db.query(Task).options(joinedload(Task.template)).filter(
        Task.scheduled_date >= start_dt,
        Task.scheduled_date <= end_dt
    )
    if user_id is not None:
        tasks_query = tasks_query.filter(or_(Task.assigned_user == user_id, Task.assigned_user == None))
    real_tasks = tasks_query.all()

    tmpl_query = db.query(TaskTemplate)
    if user_id is not None:
        tmpl_query = tmpl_query.filter(or_(TaskTemplate.default_assigned_user == user_id, TaskTemplate.default_assigned_user == None))
    templates = tmpl_query.all()

    cal_map = {}
    curr = start_dt
    while curr <= end_dt:
        cal_map[curr.strftime("%Y-%m-%d")] = []
        curr += timedelta(days=1)

    task_keys = set()
    for t in real_tasks:
        if not t.scheduled_date:
            continue
        d_str = t.scheduled_date.strftime("%Y-%m-%d")
        if d_str in cal_map:
            cal_map[d_str].append({
                "id": t.id,
                "is_projected": False,
                "template_id": t.template_id,
                "assigned_user": t.assigned_user,
                "status": t.status,
                "scheduled_date": t.scheduled_date.isoformat(),
                "repeat_type": t.template.repeat_type if t.template else None,
                "template": {
                    "id": t.template.id if t.template else None,
                    "name": t.template.name if t.template else "Unknown",
                    "time_of_day": t.template.time_of_day if t.template else "anytime",
                    "repeat_type": t.template.repeat_type if t.template else None,
                    "zone_id": t.template.zone_id if t.template else 1,
                    "description": t.template.description if t.template else "",
                    "photo_required": t.template.photo_required if t.template else False
                } if t.template else None
            })
            task_keys.add(f"{t.template_id}_{d_str}")

    def _push_projection(arr, tmpl, d_str):
        arr.append({
            "id": tmpl.id,
            "is_projected": True,
            "template_id": tmpl.id,
            "assigned_user": tmpl.default_assigned_user,
            "status": "Planned",
            "scheduled_date": f"{d_str}T00:00:00Z",
            "repeat_type": tmpl.repeat_type,
            "template": {
                "id": tmpl.id,
                "name": tmpl.name,
                "time_of_day": tmpl.time_of_day,
                "repeat_type": tmpl.repeat_type,
                "zone_id": tmpl.zone_id,
                "description": tmpl.description,
                "photo_required": tmpl.photo_required
            }
        })

    for tmpl in templates:
        if not tmpl.next_execution_date:
            continue
        if str((tmpl.repeat_type or "").lower()) == "project":
            d_str = tmpl.next_execution_date.strftime("%Y-%m-%d")
            if d_str in cal_map and f"{tmpl.id}_{d_str}" not in task_keys:
                _push_projection(cal_map[d_str], tmpl, d_str)
            continue
            
        freq = (tmpl.repeat_type or "").lower()
        if not freq:
            continue
            
        current = tmpl.next_execution_date
        while current <= end_dt:
            if current >= start_dt:
                d_str = current.strftime("%Y-%m-%d")
                if d_str in cal_map and f"{tmpl.id}_{d_str}" not in task_keys:
                    _push_projection(cal_map[d_str], tmpl, d_str)
            
            if freq == "daily":
                current += timedelta(days=1)
            elif freq == "weekly":
                current += timedelta(days=7)
            elif freq == "biweekly" or freq == "bi-weekly":
                current += timedelta(days=14)
            elif freq == "monthly":
                current += timedelta(days=28)
            else:
                break
                
    return cal_map
