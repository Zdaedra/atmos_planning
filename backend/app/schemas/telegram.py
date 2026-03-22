from pydantic import BaseModel
from typing import Optional

class TelegramWebhookPayload(BaseModel):
    user_id: str
    text: str
    author_name: Optional[str] = "Unknown"

class ChangeRequestResponse(BaseModel):
    id: int
    author: str
    source: str
    text: str
    status: str

    class Config:
        from_attributes = True
