from pydantic import BaseModel
from typing import Optional
from datetime import datetime

class ShiftBase(BaseModel):
    user_id: Optional[int] = None
    center_id: Optional[int] = None
    shift_number: Optional[int] = 1
    latitude: Optional[float] = None
    longitude: Optional[float] = None

class ShiftCreate(ShiftBase):
    pass

class ShiftResponse(ShiftBase):
    id: int
    start_time: Optional[datetime] = None
    end_time: Optional[datetime] = None
    
    class Config:
        from_attributes = True
