from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from sqlalchemy import desc
from typing import List
from pydantic import BaseModel
from datetime import datetime

from app.core.database import get_db
from app.core.security import get_current_user, require_admin
from app.models.all import SystemMessage, User

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
def create_message(msg: MessageCreate,
                   _admin: User = Depends(require_admin),
                   db: Session = Depends(get_db)):
    user = db.query(User).filter(User.id == msg.user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    new_msg = SystemMessage(user_id=msg.user_id, text=msg.text)
    db.add(new_msg)
    db.commit()
    db.refresh(new_msg)
    return new_msg


@router.get("/user/{user_id}", response_model=List[MessageResponse])
def get_user_messages(user_id: int, unread_only: bool = False,
                      current_user: User = Depends(get_current_user),
                      db: Session = Depends(get_db)):
    if current_user.id != user_id and (current_user.role or "") not in {"admin", "system_admin", "Admin"}:
        raise HTTPException(status_code=403, detail="Not allowed")
    query = db.query(SystemMessage).filter(SystemMessage.user_id == user_id)
    if unread_only:
        query = query.filter(SystemMessage.is_read == False)  # noqa: E712
    return query.order_by(desc(SystemMessage.created_at)).limit(50).all()


@router.patch("/{msg_id}/read", response_model=MessageResponse)
def mark_message_read(msg_id: int,
                      current_user: User = Depends(get_current_user),
                      db: Session = Depends(get_db)):
    msg = db.query(SystemMessage).filter(SystemMessage.id == msg_id).first()
    if not msg:
        raise HTTPException(status_code=404, detail="Message not found")
    if msg.user_id != current_user.id and (current_user.role or "") not in {"admin", "system_admin", "Admin"}:
        raise HTTPException(status_code=403, detail="Not allowed")

    msg.is_read = True
    db.commit()
    db.refresh(msg)
    return msg
