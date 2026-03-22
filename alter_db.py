import os
import sys

sys.path.append(os.path.join(os.path.dirname(__file__), "backend"))

from sqlalchemy import create_engine, text
from app.core.database import SQLALCHEMY_DATABASE_URL

# Temporary script to alter DB on Hetzner
engine = create_engine(SQLALCHEMY_DATABASE_URL)
with engine.connect() as conn:
    # Check if column is_active exists
    result = conn.execute(text("SELECT column_name FROM information_schema.columns WHERE table_name='users' AND column_name='is_active';"))
    if not result.fetchone():
        print("Adding is_active column...")
        conn.execute(text("ALTER TABLE users ADD COLUMN is_active BOOLEAN DEFAULT TRUE;"))
        conn.commit()
        print("Column added successfully.")
    else:
        print("Column already exists.")
