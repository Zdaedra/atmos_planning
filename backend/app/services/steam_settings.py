"""Singleton settings row helper. The steam_settings table is constrained to id=1;
this module hides the get-or-create dance from callers.
"""
from sqlalchemy.orm import Session

from app.models.steam import SteamSettings


def get_or_create_settings(db: Session) -> SteamSettings:
    row = db.query(SteamSettings).filter(SteamSettings.id == 1).first()
    if row is not None:
        return row
    row = SteamSettings(id=1)  # all defaults from model definition
    db.add(row)
    db.commit()
    db.refresh(row)
    return row
