from pydantic import BaseModel
from typing import Optional
from datetime import datetime

class ChangeRequestResponse(BaseModel):
    id: int
    author: str
    source: str
    text: str
    status: str
    created_at: datetime
    
    class Config:
        from_attributes = True

class ChangeRequestUpdate(BaseModel):
    status: str
