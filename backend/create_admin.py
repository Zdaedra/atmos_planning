from app.core.database import SessionLocal
from app.models.all import User
from app.api.auth import get_password_hash

def create_admin():
    db = SessionLocal()
    admin_user = db.query(User).filter(User.email == "admin@atmos.com").first()
    if not admin_user:
        admin_user = User(
            email="admin@atmos.com",
            name="Atmos Admin",
            role="system_admin",
            hashed_password=get_password_hash("admin")
        )
        db.add(admin_user)
    else:
        admin_user.hashed_password = get_password_hash("admin")
    
    db.commit()
    print("Admin user verified successfully.")

if __name__ == "__main__":
    create_admin()
