from passlib.context import CryptContext
from jose import jwt, JWTError
from datetime import datetime, timedelta
import os
import secrets

from fastapi import Depends, HTTPException, status, Header
from fastapi.security import OAuth2PasswordBearer
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.time_utils import BALI_TZ, get_now, get_today_start, to_bali

ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = 60 * 24 * 7  # 7 days

_DEV_FALLBACK_SECRET = "super_secret_dev_key_change_in_prod"
SECRET_KEY = os.getenv("SECRET_KEY") or _DEV_FALLBACK_SECRET
if SECRET_KEY == _DEV_FALLBACK_SECRET and os.getenv("ATMOS_REQUIRE_SECRET") == "1":
    raise RuntimeError("SECRET_KEY env var is required (ATMOS_REQUIRE_SECRET=1).")

INTERNAL_TOKEN = os.getenv("INTERNAL_TOKEN")  # for ai_monitor / cron callers; None disables internal-only routes from outside

ADMIN_ROLES = {"admin", "system_admin", "Admin"}

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="auth/login")


def verify_password(plain_password, hashed_password):
    return pwd_context.verify(plain_password, hashed_password)


def get_password_hash(password):
    return pwd_context.hash(password)


def create_access_token(data: dict, expires_delta: timedelta | None = None):
    to_encode = data.copy()
    if expires_delta:
        expire = datetime.utcnow() + expires_delta
    else:
        expire = datetime.utcnow() + timedelta(minutes=15)
    to_encode.update({"exp": expire})
    return jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)


def get_current_user(token: str = Depends(oauth2_scheme), db: Session = Depends(get_db)):
    from app.models.all import User  # local import to avoid cycles
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        email: str | None = payload.get("sub")
        if not email:
            raise credentials_exception
    except JWTError:
        raise credentials_exception

    user = db.query(User).filter(User.email == email).first()
    if user is None or not user.is_active:
        raise credentials_exception
    return user


def require_admin(current_user=Depends(get_current_user)):
    if (current_user.role or "") not in ADMIN_ROLES:
        raise HTTPException(status_code=403, detail="Admin role required")
    return current_user


def require_internal(x_internal_token: str | None = Header(default=None)):
    if not INTERNAL_TOKEN:
        raise HTTPException(status_code=503, detail="Internal endpoints disabled (INTERNAL_TOKEN not set)")
    if not x_internal_token or not secrets.compare_digest(x_internal_token, INTERNAL_TOKEN):
        raise HTTPException(status_code=401, detail="Invalid internal token")
    return True
