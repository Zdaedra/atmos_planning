from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from fastapi.security import OAuth2PasswordRequestForm
from datetime import timedelta

from app.core.database import get_db
from app.core.security import (
    verify_password,
    get_password_hash,
    create_access_token,
    get_current_user,
    require_admin,
    ACCESS_TOKEN_EXPIRE_MINUTES,
)
from app.models.all import User
from app.schemas.user import UserCreate, UserResponse, AdminUserResponse, Token

from typing import List

router = APIRouter()

# Backward-compat alias for modules that import `read_users_me` from this file.
read_users_me = get_current_user


@router.get("/me", response_model=UserResponse)
def me(current_user: User = Depends(get_current_user)):
    return current_user


@router.post("/shift/start", response_model=UserResponse)
def start_shift(current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    from app.core.time_utils import get_now
    current_user.last_login = get_now()
    db.commit()
    db.refresh(current_user)
    return current_user


@router.get("/users", response_model=List[AdminUserResponse])
def get_users(skip: int = 0, limit: int = 100,
              _admin: User = Depends(require_admin),
              db: Session = Depends(get_db)):
    return db.query(User).offset(skip).limit(limit).all()


@router.post("/register", response_model=UserResponse)
def register(user: UserCreate,
             _admin: User = Depends(require_admin),
             db: Session = Depends(get_db)):
    db_user = db.query(User).filter(User.email == user.email).first()
    if db_user:
        raise HTTPException(status_code=400, detail="Пользователь с таким email уже существует")

    hashed_password = get_password_hash(user.password)
    new_user = User(
        name=user.name,
        email=user.email,
        role=user.role,
        center_id=user.center_id,
        hashed_password=hashed_password,
    )
    db.add(new_user)
    db.commit()
    db.refresh(new_user)
    return new_user


@router.post("/login", response_model=Token)
def login(form_data: OAuth2PasswordRequestForm = Depends(), db: Session = Depends(get_db)):
    user = db.query(User).filter(User.email == form_data.username).first()
    if (
        not user
        or not user.is_active
        or not getattr(user, "hashed_password", None)
        or not verify_password(form_data.password, user.hashed_password)
    ):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect email or password",
            headers={"WWW-Authenticate": "Bearer"},
        )

    # Phase 79: Device Binding (one device per account, except a list of exempt accounts).
    incoming_device_id = getattr(form_data, "client_id", None)
    if incoming_device_id:
        if (user.email or "").lower() == "alexey.volvak@gmail.com":
            pass  # Exempt from device binding
        elif not user.device_id:
            user.device_id = incoming_device_id
            db.commit()
            db.refresh(user)
        elif user.device_id != incoming_device_id:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Данный аккаунт уже привязан к другому устройству. Обратитесь к администратору для сброса.",
            )

    access_token_expires = timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    access_token = create_access_token(
        data={"sub": user.email, "role": user.role}, expires_delta=access_token_expires
    )
    return {"access_token": access_token, "token_type": "bearer"}


@router.patch("/users/{user_id}/archive", response_model=UserResponse)
def archive_user(user_id: int,
                 current_user: User = Depends(require_admin),
                 db: Session = Depends(get_db)):
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    user.is_active = False
    db.commit()
    db.refresh(user)
    return user


@router.patch("/users/{user_id}/reset-device", response_model=UserResponse)
def reset_device(user_id: int,
                 current_user: User = Depends(require_admin),
                 db: Session = Depends(get_db)):
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    user.device_id = None
    db.commit()
    db.refresh(user)
    return user
