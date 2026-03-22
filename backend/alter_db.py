import sys
import os
sys.path.append("/Users/daedra/.gemini/antigravity/scratch/atmos_planning/backend")
from sqlalchemy import text
from app.core.database import engine

with engine.connect() as conn:
    try:
        conn.execute(text("ALTER TABLE task_templates ADD COLUMN default_assigned_user INTEGER REFERENCES users(id)"))
        conn.commit()
        print("Column added successfully")
    except Exception as e:
        if "already exists" in str(e).lower() or "duplicate column" in str(e).lower():
            print("Column already exists")
        else:
            print(f"Error: {e}")
