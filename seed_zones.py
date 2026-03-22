from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
import os
import sys

# Ensure app is in path
sys.path.append("/app")

from app.models.all import Zone, Center
from app.core.database import Base

DATABASE_URL = os.getenv("DATABASE_URL", "postgresql://atmos_user:atmos_password@atmos_db:5432/atmos_db")
engine = create_engine(DATABASE_URL)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

ZONES = [
    "Black Dome",
    "White Dome",
    "Swimming pool",
    "Cold plunge",
    "Hot plunge",
    "Ice plunges",
    "Portal showers",
    "Black stone shower",
    "Terracotta shower",
    "Lockers Male",
    "Lockers Female",
    "Toilets",
    "Sunken lounge",
    "Main lounge",
    "Fireplace",
    "Parking area"
]

def update_zones():
    db = SessionLocal()
    
    # Check if a center exists, if not create default
    center = db.query(Center).first()
    if not center:
        center = Center(name="Main Facility", location="HQ")
        db.add(center)
        db.commit()
        db.refresh(center)
        
    center_id = center.id

    # Get all current zones
    existing_zones = db.query(Zone).all()
    
    # We do NOT want to delete old zones because tasks might be linked to them, 
    # but since this is a clean wipe of zones request, let's just insert or update them
    # Actually, let's just create them if they do not exist
    
    # For a clean approach, let's wipe all zones that have no tasks, but wait, Tasks have FK on Zone.
    # We can just rename the first 16 zones, or just append new ones. Let's just create new ones and we can map.
    # Best is to clear and reset the ID sequence if this is fresh data, but there might be tasks.
    # Since this is a test environment, let's just grab existing zones and update them by ID if they exist, else create.
    
    for idx, zone_name in enumerate(ZONES):
        zone_id = idx + 1
        zone = db.query(Zone).filter(Zone.id == zone_id).first()
        if zone:
            zone.name = zone_name
        else:
            zone = Zone(id=zone_id, name=zone_name, center_id=center_id)
            db.add(zone)
            
    db.commit()
    print("Successfully updated database zones.")

if __name__ == "__main__":
    update_zones()
