from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from sqlalchemy import desc
from typing import List, Optional
from pydantic import BaseModel
from datetime import datetime

from app.core.database import get_db
from app.models.all import SystemMessage, User
from app.api.auth import read_users_me

router = APIRouter()

class MessageCreate(BaseModel):
    user_id: int
    text: str

class MessageResponse(BaseModel):
    id: int
    text: str
    is_read: bool
    created_at: datetime
    
    class Config:
        from_attributes = True

@router.post("/", response_model=MessageResponse)
def create_message(msg: MessageCreate, db: Session = Depends(get_db)):
    user = db.query(User).filter(User.id == msg.user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
        
    new_msg = SystemMessage(user_id=msg.user_id, text=msg.text)
    db.add(new_msg)
    db.commit()
    db.refresh(new_msg)
    return new_msg

@router.get("/user/{user_id}", response_model=List[MessageResponse])
def get_user_messages(user_id: int, unread_only: bool = False, db: Session = Depends(get_db)):
    query = db.query(SystemMessage).filter(SystemMessage.user_id == user_id)
    if unread_only:
        query = query.filter(SystemMessage.is_read == False)
    return query.order_by(desc(SystemMessage.created_at)).limit(50).all()

@router.patch("/{msg_id}/read", response_model=MessageResponse)
def mark_message_read(msg_id: int, db: Session = Depends(get_db)):
    msg = db.query(SystemMessage).filter(SystemMessage.id == msg_id).first()
    if not msg:
        raise HTTPException(status_code=404, detail="Message not found")
        
    msg.is_read = True
    db.commit()
    db.refresh(msg)
    return msg
