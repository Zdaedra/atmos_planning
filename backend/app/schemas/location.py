from pydantic import BaseModel
from typing import Optional, List

class CenterBase(BaseModel):
    name: str
    location: str

class CenterCreate(CenterBase):
    pass

class CenterResponse(CenterBase):
    id: int

    class Config:
        from_attributes = True

class ZoneBase(BaseModel):
    center_id: int
    name: str

class ZoneCreate(ZoneBase):
    pass

class ZoneResponse(ZoneBase):
    id: int

    class Config:
        from_attributes = True
