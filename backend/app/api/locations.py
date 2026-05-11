from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from typing import List

from app.core.database import get_db
from app.core.security import get_current_user, require_admin
from app.models.all import Center, Zone, User
from app.schemas.location import CenterCreate, CenterResponse, ZoneCreate, ZoneResponse

router = APIRouter()


@router.get("/centers/", response_model=List[CenterResponse])
def get_centers(skip: int = 0, limit: int = 100,
                _user: User = Depends(get_current_user),
                db: Session = Depends(get_db)):
    return db.query(Center).offset(skip).limit(limit).all()


@router.post("/centers/", response_model=CenterResponse)
def create_center(center: CenterCreate,
                  _admin: User = Depends(require_admin),
                  db: Session = Depends(get_db)):
    db_center = Center(**center.model_dump())
    db.add(db_center)
    db.commit()
    db.refresh(db_center)
    return db_center


@router.get("/zones/", response_model=List[ZoneResponse])
def get_zones(skip: int = 0, limit: int = 100,
              _user: User = Depends(get_current_user),
              db: Session = Depends(get_db)):
    return db.query(Zone).offset(skip).limit(limit).all()


@router.post("/zones/", response_model=ZoneResponse)
def create_zone(zone: ZoneCreate,
                _admin: User = Depends(require_admin),
                db: Session = Depends(get_db)):
    center = db.query(Center).filter(Center.id == zone.center_id).first()
    if not center:
        raise HTTPException(status_code=404, detail="Center not found")

    db_zone = Zone(**zone.model_dump())
    db.add(db_zone)
    db.commit()
    db.refresh(db_zone)
    return db_zone
