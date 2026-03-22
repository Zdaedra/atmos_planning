from sqlalchemy import Column, Integer, String, Boolean, DateTime, ForeignKey, Text
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from app.core.database import Base

class User(Base):
    __tablename__ = "users"
    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, index=True)
    email = Column(String, unique=True, index=True)
    hashed_password = Column(String)
    plain_password = Column(String)
    role = Column(String, default="supervisor") # supervisor, garden supervisor, admin, system_admin
    is_active = Column(Boolean, default=True)
    center_id = Column(Integer, ForeignKey("centers.id"))
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    last_login = Column(DateTime(timezone=True), nullable=True)

class Center(Base):
    __tablename__ = "centers"
    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, index=True)
    location = Column(String)

class Zone(Base):
    __tablename__ = "zones"
    id = Column(Integer, primary_key=True, index=True)
    center_id = Column(Integer, ForeignKey("centers.id"))
    name = Column(String)

class Shift(Base):
    __tablename__ = "shifts"
    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"))
    center_id = Column(Integer, ForeignKey("centers.id"))
    start_time = Column(DateTime(timezone=True), server_default=func.now())
    end_time = Column(DateTime(timezone=True), nullable=True)

class TaskTemplate(Base):
    __tablename__ = "task_templates"
    id = Column(Integer, primary_key=True, index=True)
    name = Column(String)
    description = Column(Text)
    zone_id = Column(Integer, ForeignKey("zones.id"))
    repeat_type = Column(String) # daily, weekly, biweekly, monthly
    time_of_day = Column(String, default="anytime") # morning, evening, anytime
    photo_required = Column(Boolean, default=False)
    checklist = Column(Text) # Stored as JSON string for simplicity
    last_completed_at = Column(DateTime(timezone=True), nullable=True)
    last_generated_date = Column(DateTime(timezone=True), nullable=True)
    next_execution_date = Column(DateTime(timezone=True), nullable=True)
    last_generated_date = Column(DateTime(timezone=True), nullable=True)
    default_assigned_user = Column(Integer, ForeignKey("users.id"), nullable=True)

class Task(Base):
    __tablename__ = "tasks"
    id = Column(Integer, primary_key=True, index=True)
    template_id = Column(Integer, ForeignKey("task_templates.id"))
    template = relationship("TaskTemplate")
    zone_id = Column(Integer, ForeignKey("zones.id"))
    assigned_user = Column(Integer, ForeignKey("users.id"))
    scheduled_date = Column(DateTime(timezone=True))
    status = Column(String, default="Planned") # Planned, In progress, Done, Overdue, Completed
    priority = Column(String, default="normal")
    ai_status = Column(String, default="pending") # pending, approved, flagged
    ai_reasoning = Column(Text, nullable=True)

    photos = relationship("TaskPhoto", back_populates="task")
    comments = relationship("TaskComment", back_populates="task")

class TaskPhoto(Base):
    __tablename__ = "task_photos"
    id = Column(Integer, primary_key=True, index=True)
    task_id = Column(Integer, ForeignKey("tasks.id"))
    url = Column(String)
    uploaded_by = Column(Integer, ForeignKey("users.id"))
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    task = relationship("Task", back_populates="photos")

class TaskComment(Base):
    __tablename__ = "task_comments"
    id = Column(Integer, primary_key=True, index=True)
    task_id = Column(Integer, ForeignKey("tasks.id"))
    user_id = Column(Integer, ForeignKey("users.id"))
    text = Column(Text)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    task = relationship("Task", back_populates="comments")

class ChangeRequest(Base):
    __tablename__ = "change_requests"
    id = Column(Integer, primary_key=True, index=True)
    author = Column(String)
    source = Column(String, default="telegram")
    text = Column(Text)
    status = Column(String, default="new") # new, in_progress, done, rejected
    created_at = Column(DateTime(timezone=True), server_default=func.now())

class TelegramMessage(Base):
    __tablename__ = "telegram_messages"
    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(String)
    message = Column(Text)
    transcription = Column(Text, nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

class SystemMessage(Base):
    __tablename__ = "system_messages"
    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"))
    text = Column(String)
    is_read = Column(Boolean, default=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

