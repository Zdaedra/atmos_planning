from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from fastapi.security import OAuth2PasswordBearer, OAuth2PasswordRequestForm
from datetime import timedelta
from jose import JWTError, jwt

from app.core.database import get_db
from app.core.security import verify_password, get_password_hash, create_access_token, ACCESS_TOKEN_EXPIRE_MINUTES, SECRET_KEY, ALGORITHM
from app.models.all import User
from app.schemas.user import UserCreate, UserResponse, Token

from typing import List

router = APIRouter()
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="auth/login")

@router.get("/me", response_model=UserResponse)
def read_users_me(token: str = Depends(oauth2_scheme), db: Session = Depends(get_db)):
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        email: str = payload.get("sub")
        if email is None:
            raise credentials_exception
    except JWTError:
        raise credentials_exception
        
    user = db.query(User).filter(User.email == email).first()
    if user is None or not user.is_active:
        raise credentials_exception
    return user

@router.post("/shift/start", response_model=UserResponse)
def start_shift(current_user: User = Depends(read_users_me), db: Session = Depends(get_db)):
    from datetime import datetime, timezone
    current_user.last_login = datetime.now(timezone.utc)
    db.commit()
    db.refresh(current_user)
    return current_user

@router.get("/users", response_model=List[UserResponse])
def get_users(skip: int = 0, limit: int = 100, db: Session = Depends(get_db)):
    return db.query(User).offset(skip).limit(limit).all()

@router.post("/register", response_model=UserResponse)
def register(user: UserCreate, db: Session = Depends(get_db)):
    db_user = db.query(User).filter(User.email == user.email).first()
    if db_user:
        raise HTTPException(status_code=400, detail="Пользователь с таким email уже существует")
    
    hashed_password = get_password_hash(user.password)
    new_user = User(
        name=user.name,
        email=user.email,
        role=user.role,
        center_id=user.center_id,
        plain_password=user.password,
        hashed_password=hashed_password
    )
    
    db.add(new_user)
    db.commit()
    db.refresh(new_user)
    return new_user

@router.post("/login", response_model=Token)
def login(form_data: OAuth2PasswordRequestForm = Depends(), db: Session = Depends(get_db)):
    user = db.query(User).filter(User.email == form_data.username).first()
    if not user or not user.is_active or not hasattr(user, 'hashed_password') or not verify_password(form_data.password, getattr(user, 'hashed_password')):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect email or password",
            headers={"WWW-Authenticate": "Bearer"},
        )
    
    # Phase 79: Device Binding mapping client_id field safely
    incoming_device_id = getattr(form_data, "client_id", None)
    if incoming_device_id:
        if not user.device_id:
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
def archive_user(user_id: int, current_user: User = Depends(read_users_me), db: Session = Depends(get_db)):
    print(f"[ARCHIVE_USER] Called by email={current_user.email}, role={current_user.role}", flush=True)
    if current_user.role not in ["admin", "system_admin", "Admin"]:
        raise HTTPException(status_code=403, detail=f"Not authorized. Role: '{current_user.role}', Email: '{current_user.email}'")
    
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
        
    user.is_active = False
    db.commit()
    db.refresh(user)
    return user

@router.patch("/users/{user_id}/reset-device", response_model=UserResponse)
def reset_device(user_id: int, current_user: User = Depends(read_users_me), db: Session = Depends(get_db)):
    if current_user.role not in ["admin", "system_admin"]:
        raise HTTPException(status_code=403, detail="Not authorized")
    
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
        
    user.device_id = None
    db.commit()
    db.refresh(user)
    return user
