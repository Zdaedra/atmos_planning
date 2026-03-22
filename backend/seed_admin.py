from app.core.database import SessionLocal
from app.models.all import User
from passlib.context import CryptContext

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")
db = SessionLocal()

email = "alexey.volvak@gmail.com"
password = "alexey.volvak@gmail.com"
hashed_password = pwd_context.hash(password)

user = db.query(User).filter(User.email == email).first()
if not user:
    user = User(
        name="Alexey Volvak",
        email=email,
        hashed_password=hashed_password,
        role="system_admin"
    )
    db.add(user)
    db.commit()
    print("SuperAdmin created successfully")
else:
    user.role = "system_admin"
    user.hashed_password = hashed_password
    db.commit()
    print("SuperAdmin updated successfully")
