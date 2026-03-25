from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from typing import List
from passlib.context import CryptContext

from app.core.database import get_db
from app.models.all import User
from app.schemas.user import UserCreate, UserResponse, UserUpdate
from app.core.security import get_password_hash

router = APIRouter()

@router.get("/", response_model=List[UserResponse])
def get_supervisors(skip: int = 0, limit: int = 100, db: Session = Depends(get_db)):
    return db.query(User).filter(User.role == "supervisor").offset(skip).limit(limit).all()

@router.post("/", response_model=UserResponse)
def create_supervisor(user: UserCreate, db: Session = Depends(get_db)):
    db_user = db.query(User).filter(User.email == user.email).first()
    if db_user:
        raise HTTPException(status_code=400, detail="Email already registered")
    
    hashed_password = get_password_hash(user.password)
    
    new_user = User(
        name=user.name,
        email=user.email,
        role="supervisor", # always supervisor
        center_id=user.center_id,
        plain_password=user.password
    )
    setattr(new_user, 'hashed_password', hashed_password)
    
    db.add(new_user)
    db.commit()
    db.refresh(new_user)
    return new_user

import base64
import uuid
import io
from PIL import Image, ImageOps
from app.core.storage import get_minio_client, MINIO_BUCKET

@router.put("/{user_id}", response_model=UserResponse)
def update_supervisor(user_id: int, user_update: UserUpdate, db: Session = Depends(get_db)):
    user_db = db.query(User).filter(User.id == user_id, User.role == "supervisor").first()
    if not user_db:
        raise HTTPException(status_code=404, detail="Supervisor not found")
        
    if user_update.name is not None:
        user_db.name = user_update.name
    if user_update.email is not None:
        # check collision
        existing = db.query(User).filter(User.email == user_update.email, User.id != user_id).first()
        if existing:
             raise HTTPException(status_code=400, detail="Email already employed")
        user_db.email = user_update.email
    if user_update.password:
        user_db.hashed_password = get_password_hash(user_update.password)
        user_db.plain_password = user_update.password
        
    if user_update.avatar_base64:
        header, encoded = user_update.avatar_base64.split(",", 1) if "," in user_update.avatar_base64 else ("", user_update.avatar_base64)
        try:
            file_bytes = base64.b64decode(encoded)
            image = Image.open(io.BytesIO(file_bytes))
            image = ImageOps.exif_transpose(image)
            if image.mode != "RGB":
                image = image.convert("RGB")
                
            max_width = 400
            if image.width > max_width:
                ratio = max_width / image.width
                image = image.resize((max_width, int(image.height * ratio)), Image.Resampling.LANCZOS)
                
            img_byte_arr = io.BytesIO()
            image.save(img_byte_arr, format='JPEG', quality=80, optimize=True)
            img_byte_arr.seek(0)
            
            client = get_minio_client()
            unique_filename = f"avatar_{user_id}_{uuid.uuid4().hex[:8]}.jpg"
            client.put_object(
                MINIO_BUCKET,
                unique_filename,
                img_byte_arr,
                length=img_byte_arr.getbuffer().nbytes,
                content_type="image/jpeg"
            )
            file_url = f"https://api.trypranaextract.com/{MINIO_BUCKET}/{unique_filename}"
            user_db.avatar_url = file_url
        except Exception as e:
            print(f"Error processing base64 avatar: {e}")
        
    db.commit()
    db.refresh(user_db)
    return user_db

@router.delete("/{user_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_supervisor(user_id: int, db: Session = Depends(get_db)):
    user_db = db.query(User).filter(User.id == user_id, User.role == "supervisor").first()
    if not user_db:
        raise HTTPException(status_code=404, detail="Supervisor not found")
        
    db.delete(user_db)
    db.commit()
    return None
