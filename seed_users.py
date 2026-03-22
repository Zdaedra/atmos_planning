from app.database import SessionLocal, engine, Base
from app.models.user import User
from passlib.context import CryptContext

pwd_context = CryptContext(schemes=['bcrypt'], deprecated='auto')
db = SessionLocal()

default_admin = db.query(User).filter(User.email == 'admin@atmos.local').first()
if not default_admin:
    user = User(
        email='admin@atmos.local',
        hashed_password=pwd_context.hash('admin123'),
        role='admin',
        is_active=True,
        first_name='Admin',
        last_name='User'
    )
    db.add(user)
    db.commit()
    print('Admin created')
else:
    print('Admin exists')
