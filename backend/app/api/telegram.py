from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from app.core.database import get_db
from app.models.all import ChangeRequest, TelegramMessage
from app.schemas.telegram import TelegramWebhookPayload, ChangeRequestResponse

router = APIRouter(prefix="/telegram", tags=["telegram"])

@router.post("/webhook", response_model=ChangeRequestResponse)
def handle_telegram_webhook(payload: TelegramWebhookPayload, db: Session = Depends(get_db)):
    """
    Mock endpoint to simulate receiving a Telegram message from a Supervisor.
    In production, this would be authenticated and called by Telegram's webhook system.
    If the message contains a request, it logs a ChangeRequest.
    """
    # 1. Log the raw message
    new_msg = TelegramMessage(
        user_id=payload.user_id,
        message=payload.text,
        transcription=None
    )
    db.add(new_msg)
    db.commit()

    # 2. Extract intent (Mock rule: if it starts with "Request:", treat as change request)
    # Simple rule for MVP
    text_check = payload.text.lower()
    
    # Just create a change request out of the message for the MVP demonstration
    new_request = ChangeRequest(
        author=payload.author_name,
        source="telegram",
        text=payload.text,
        status="new"
    )
    db.add(new_request)
    db.commit()
    db.refresh(new_request)

    return new_request

@router.get("/change-requests", response_model=list[ChangeRequestResponse])
def get_change_requests(db: Session = Depends(get_db)):
    """
    Endpoint for Admin Dashboard to fetch active change requests.
    """
    return db.query(ChangeRequest).order_by(ChangeRequest.created_at.desc()).all()
