from pydantic import BaseModel
from typing import Optional
from datetime import datetime

class ShiftBase(BaseModel):
    user_id: int
    center_id: int

class ShiftCreate(ShiftBase):
    pass

class ShiftResponse(ShiftBase):
    id: int
    start_time: datetime
    end_time: Optional[datetime] = None
    
    class Config:
        from_attributes = True
