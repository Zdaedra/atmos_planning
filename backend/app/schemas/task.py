from pydantic import BaseModel
from typing import Optional, List
from datetime import datetime

class TaskBase(BaseModel):
    zone_id: int
    scheduled_date: datetime
    status: str = "Planned"
    priority: str = "normal"

class TaskCreate(TaskBase):
    template_id: int
    assigned_user: Optional[int] = None

class TaskResponse(TaskBase):
    id: int
    template_id: int
    assigned_user: Optional[int] = None
    
    class Config:
        from_attributes = True

class TaskTemplateBase(BaseModel):
    name: str
    description: Optional[str] = None
    zone_id: int
    repeat_type: str = "daily"  # daily, weekly, biweekly, monthly
    time_of_day: str = "anytime" # morning, evening, anytime
    photo_required: bool = False
    checklist: Optional[str] = None
    last_completed_at: Optional[datetime] = None
    next_execution_date: Optional[datetime] = None

class TaskTemplateCreate(TaskTemplateBase):
    pass

class TaskCompleteRequest(BaseModel):
    comments: Optional[str] = None
    photo_data_base64: Optional[str] = None

class TaskRevertRequest(BaseModel):
    comments: Optional[str] = None

class TaskImportRequest(BaseModel):
    text: str

class TaskTemplateResponse(TaskTemplateBase):
    id: int
    
    class Config:
        from_attributes = True

class TaskCommentResponse(BaseModel):
    id: int
    text: str
    created_at: datetime
    
    class Config:
        from_attributes = True

class TaskWithTemplateResponse(TaskResponse):
    template: Optional[TaskTemplateResponse] = None
    photos: List["TaskPhotoResponse"] = []
    comments: List[TaskCommentResponse] = []

class TaskPhotoBase(BaseModel):
    task_id: int
    url: str

class TaskPhotoResponse(TaskPhotoBase):
    id: int
    uploaded_by: Optional[int] = None
    created_at: datetime
    
    class Config:
        from_attributes = True
