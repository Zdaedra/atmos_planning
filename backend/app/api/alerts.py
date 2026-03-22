from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from typing import List

from app.core.database import get_db
from app.models.all import ChangeRequest
from app.schemas.ai_alert import ChangeRequestResponse, ChangeRequestUpdate

router = APIRouter()

@router.get("/", response_model=List[ChangeRequestResponse])
def get_change_requests(skip: int = 0, limit: int = 100, db: Session = Depends(get_db)):
    return db.query(ChangeRequest).order_by(ChangeRequest.created_at.desc()).offset(skip).limit(limit).all()

@router.put("/{request_id}", response_model=ChangeRequestResponse)
def update_change_request_status(request_id: int, request_update: ChangeRequestUpdate, db: Session = Depends(get_db)):
    db_request = db.query(ChangeRequest).filter(ChangeRequest.id == request_id).first()
    if not db_request:
        raise HTTPException(status_code=404, detail="Change request not found")
        
    db_request.status = request_update.status
    db.commit()
    db.refresh(db_request)
    return db_request
