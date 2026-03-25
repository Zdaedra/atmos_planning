from fastapi import APIRouter, Depends, HTTPException, UploadFile, File
from sqlalchemy.orm import Session
import uuid
import os
import io
from PIL import Image, ImageOps

from app.core.database import get_db
from app.core.storage import get_minio_client, MINIO_BUCKET
from app.models.all import TaskPhoto, Task, User, Zone

router = APIRouter()

@router.get("/reports")
def get_recent_reports(skip: int = 0, limit: int = 50, db: Session = Depends(get_db)):
    photos = db.query(TaskPhoto)\
        .order_by(TaskPhoto.created_at.desc())\
        .offset(skip).limit(limit).all()
        
    result = []
    for p in photos:
        task = db.query(Task).filter(Task.id == p.task_id).first()
        user = db.query(User).filter(User.id == p.uploaded_by).first() if p.uploaded_by else None
        zone = db.query(Zone).filter(Zone.id == task.zone_id).first() if task and task.zone_id else None
        
        result.append({
            "id": p.id,
            "url": p.url,
            "created_at": p.created_at.isoformat() if p.created_at else None,
            "task_id": p.task_id,
            "zone_name": zone.name if zone else "Unknown Zone",
            "uploaded_by_name": user.name if user else "Unknown User"
        })
        
    return result

@router.post("/upload", response_model=dict)
def upload_photo(task_id: int, file: UploadFile = File(...), db: Session = Depends(get_db)):
    db_task = db.query(Task).filter(Task.id == task_id).first()
    if not db_task:
        raise HTTPException(status_code=404, detail="Task not found")

    client = get_minio_client()
    unique_filename = f"{task_id}_{uuid.uuid4().hex}.jpg"
    
    try:
        # Read file into memory and process with Pillow
        contents = file.file.read()
        image = Image.open(io.BytesIO(contents))
        
        # Preserve original smartphone orientation EXIF data
        image = ImageOps.exif_transpose(image)
        
        # Convert to RGB (drops alpha for JPEG compat)
        if image.mode != "RGB":
            image = image.convert("RGB")
            
        # Downscale if larger than 800px wide
        max_width = 800
        if image.width > max_width:
            ratio = max_width / image.width
            new_size = (max_width, int(image.height * ratio))
            image = image.resize(new_size, Image.Resampling.LANCZOS)
            
        # Compress buffer heavily
        img_byte_arr = io.BytesIO()
        image.save(img_byte_arr, format='JPEG', quality=65, optimize=True)
        img_byte_arr.seek(0)

        # Upload compressed bytes to MinIO
        client.put_object(
            MINIO_BUCKET,
            unique_filename,
            img_byte_arr,
            length=img_byte_arr.getbuffer().nbytes,
            content_type="image/jpeg"
        )
        
        # Hardcode the public Hetzner edge IP so phones can route properly outside the local docker network
        file_url = f"https://api.trypranaextract.com/{MINIO_BUCKET}/{unique_filename}"
        
        db_photo = TaskPhoto(
            task_id=task_id,
            url=file_url,
            # uploaded_by=user_id # Removed for simplicity in this MVP endpoint without full auth injection
        )
        db.add(db_photo)
        db.commit()
        db.refresh(db_photo)
        
        return {"id": db_photo.id, "url": db_photo.url, "message": "Upload successful"}
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.delete("/upload/{photo_id}")
def delete_photo(photo_id: int, db: Session = Depends(get_db)):
    db_photo = db.query(TaskPhoto).filter(TaskPhoto.id == photo_id).first()
    if not db_photo:
        raise HTTPException(status_code=404, detail="Photo not found")
        
    client = get_minio_client()
    try:
        # Extract filename from url: http://.../MINIO_BUCKET/filename
        filename = db_photo.url.split('/')[-1]
        client.remove_object(MINIO_BUCKET, filename)
    except Exception as e:
        print(f"Failed to delete from MinIO: {e}")
        # Proceed to delete from DB anyway so the user isn't stuck
        
    db.delete(db_photo)
    db.commit()
    return {"message": "Photo deleted"}
