from app.core.database import SessionLocal
from app.models.all import User
db = SessionLocal()
users = db.query(User).all()
for u in users:
    print(f"{u.email} - {u.role}")
