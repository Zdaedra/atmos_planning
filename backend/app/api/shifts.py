from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from datetime import datetime
from typing import List
import math
import os

from app.core.database import get_db
from app.models.all import Shift, Task
from app.schemas.shift import ShiftCreate, ShiftResponse

router = APIRouter()

REFERENCE_LATITUDE = float(os.getenv("REFERENCE_LATITUDE", "25.2048"))
REFERENCE_LONGITUDE = float(os.getenv("REFERENCE_LONGITUDE", "55.2708"))
MAX_SHIFT_RADIUS_METERS = int(os.getenv("MAX_SHIFT_RADIUS_METERS", 200))

def haversine_distance(lat1, lon1, lat2, lon2):
    R = 6371000 # radius of Earth in meters
    phi1, phi2 = math.radians(lat1), math.radians(lat2)
    delta_phi = math.radians(lat2 - lat1)
    delta_lambda = math.radians(lon2 - lon1)
    a = math.sin(delta_phi/2.0)**2 + math.cos(phi1) * math.cos(phi2) * math.sin(delta_lambda/2.0)**2
    return R * (2 * math.atan2(math.sqrt(a), math.sqrt(1-a)))

@router.post("/start", response_model=ShiftResponse)
def start_shift(shift: ShiftCreate, db: Session = Depends(get_db)):
    if shift.latitude is None or shift.longitude is None:
        raise HTTPException(status_code=403, detail="Geolocation is required to start a shift. Please allow access to location data.")
        
    distance = haversine_distance(REFERENCE_LATITUDE, REFERENCE_LONGITUDE, shift.latitude, shift.longitude)
    if distance > MAX_SHIFT_RADIUS_METERS:
        raise HTTPException(status_code=403, detail=f"You are too far from the workplace. (Distance: {int(distance)}m, Max: {MAX_SHIFT_RADIUS_METERS}m) [Your location: {shift.latitude}, {shift.longitude}]")

    from datetime import timedelta
    
    # Auto-close any previously unclosed shifts for this user
    active_shifts = db.query(Shift).filter(
        Shift.user_id == shift.user_id, 
        Shift.end_time.is_(None)
    ).all()
    
    if active_shifts:
        for s in active_shifts:
            # If the shift was started less than 14 hours ago (same day), they are probably trying to start a 2nd shift.
            # Or the frontend mistakenly prompted. But we can just auto-close the old one always.
            s.end_time = datetime.utcnow()
        db.commit()
    db_shift = Shift(
        user_id=shift.user_id, 
        center_id=shift.center_id,
        shift_number=shift.shift_number,
        latitude=shift.latitude,
        longitude=shift.longitude
    )
    db.add(db_shift)
    db.commit()
    db.refresh(db_shift)
    
    return db_shift

@router.post("/{shift_id}/end", response_model=ShiftResponse)
def end_shift(shift_id: int, db: Session = Depends(get_db)):
    db_shift = db.query(Shift).filter(Shift.id == shift_id).first()
    if not db_shift:
        raise HTTPException(status_code=404, detail="Shift not found")
        
    if db_shift.end_time:
        raise HTTPException(status_code=400, detail="Shift already ended")
        
    db_shift.end_time = datetime.utcnow()
    db.commit()
    db.refresh(db_shift)
    return db_shift

@router.get("/active", response_model=List[ShiftResponse])
def get_active_shifts(db: Session = Depends(get_db)):
    from datetime import timedelta
    # Only return shifts started within the last 14 hours
    cutoff = datetime.utcnow() - timedelta(hours=14)
    return db.query(Shift).filter(
        Shift.end_time.is_(None),
        Shift.start_time >= cutoff
    ).all()
