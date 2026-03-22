from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from datetime import datetime
from typing import List

from app.core.database import get_db
from app.models.all import Shift, Task
from app.schemas.shift import ShiftCreate, ShiftResponse

router = APIRouter()

@router.post("/start", response_model=ShiftResponse)
def start_shift(shift: ShiftCreate, db: Session = Depends(get_db)):
    active_shift = db.query(Shift).filter(
        Shift.user_id == shift.user_id, 
        Shift.end_time.is_(None)
    ).first()
    
    if active_shift:
        raise HTTPException(status_code=400, detail="User already has an active shift")
        
    db_shift = Shift(user_id=shift.user_id, center_id=shift.center_id)
    db.add(db_shift)
    db.commit()
    db.refresh(db_shift)
    
    # Phase 30: Auto-assign open tasks for today back to the starting supervisor
    # To handle timezones gracefully, we consider tasks scheduled >= today_start
    now = datetime.utcnow()
    # Simple UTC today boundary for consistency with Task creation logic
    today_start = datetime(now.year, now.month, now.day)
    
    open_tasks = db.query(Task).filter(
        Task.assigned_user.is_(None),
        Task.status == "Planned",
        Task.scheduled_date >= today_start
    ).all()
    
    if open_tasks:
        for t in open_tasks:
            t.assigned_user = shift.user_id
        db.commit()
        
    return db_shift

@router.post("/{shift_id}/end", response_model=ShiftResponse)
def end_shift(shift_id: int, db: Session = Depends(get_db)):
    db_shift = db.query(Shift).filter(Shift.id == shift_id).first()
    if not db_shift:
        raise HTTPException(status_code=404, detail="Shift not found")
        
    if db_shift.end_time:
        raise HTTPException(status_code=400, detail="Shift already ended")
        
    db_shift.end_time = datetime.utcnow()
    db.commit()
    db.refresh(db_shift)
    return db_shift

@router.get("/active", response_model=List[ShiftResponse])
def get_active_shifts(db: Session = Depends(get_db)):
    return db.query(Shift).filter(Shift.end_time.is_(None)).all()
