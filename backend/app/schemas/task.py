import json
from pydantic import BaseModel, field_validator, field_serializer
from typing import Optional, List, Any
from datetime import datetime


class SupplyItem(BaseModel):
    name: str
    qty: Optional[str] = None


class TaskBase(BaseModel):
    zone_id: int
    scheduled_date: datetime
    status: str = "Planned"


class TaskCreate(TaskBase):
    template_id: int
    assigned_user: Optional[int] = None


class TaskResponse(TaskBase):
    id: int
    template_id: int
    assigned_user: Optional[int] = None
    actual_completed_at: Optional[datetime] = None
    ai_status: Optional[str] = None
    ai_reasoning: Optional[str] = None
    is_supply: bool = False

    class Config:
        from_attributes = True


class TaskTemplateBase(BaseModel):
    name: str
    description: Optional[str] = None
    zone_id: int
    repeat_type: str = "daily"  # daily, weekly, biweekly, monthly, project, custom, mini
    repeat_interval_days: Optional[int] = None
    time_of_day: str = "anytime"
    photo_required: bool = False
    checklist: Optional[str] = None
    next_execution_date: Optional[datetime] = None
    department: str = "maintenance"
    supply: Optional[List[SupplyItem]] = None
    supply_days_before: Optional[int] = None

    @field_validator("supply", mode="before")
    @classmethod
    def _parse_supply(cls, v: Any):
        # DB stores supply as a JSON string in a TEXT column. Accept both shapes.
        if v is None or v == "":
            return None
        if isinstance(v, list):
            return v
        if isinstance(v, str):
            try:
                parsed = json.loads(v)
                if isinstance(parsed, list):
                    return parsed
                # legacy free-text supply (single item)
                return [{"name": v, "qty": None}]
            except (ValueError, TypeError):
                return [{"name": v, "qty": None}]
        return None


class TaskTemplateCreate(TaskTemplateBase):
    pass


class TaskCompleteRequest(BaseModel):
    comments: Optional[str] = None
    photo_data_base64: Optional[str] = None


class TaskBulkCompleteRequest(BaseModel):
    task_ids: List[int]


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
