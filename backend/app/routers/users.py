from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from app.core.logging_config import log_to_db
from app.core.redis_client import get_user_status, set_user_status
from app.core.security import hash_password, verify_password
from app.dependencies.auth import get_current_user
from app.dependencies.db import get_db
from app.dependencies.auth import get_token_payload
from app.dependencies.rbac import get_login_mode, is_effective_admin, require_admin
from app.models import User
from app.schemas import ChangePasswordSchema, UserRegisterSchema, UserStatusSchema

router = APIRouter(prefix="/users", tags=["Users"])


@router.get("/me")
def get_me(
    current_user: User = Depends(get_current_user),
    payload: dict = Depends(get_token_payload),
):
    login_mode = get_login_mode(payload)
    return {
        "id": current_user.id,
        "email": current_user.email,
        "username": current_user.username,
        "full_name": current_user.full_name,
        "role": current_user.role,
        "login_mode": login_mode,
        "is_admin": is_effective_admin(current_user, login_mode),
        "status": get_user_status(current_user.id),
    }


@router.post("/change-password")
def change_password(
    data: ChangePasswordSchema,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if not verify_password(data.old_password, current_user.hashed_password):
        raise HTTPException(status_code=400, detail="Неверный текущий пароль")

    if len(data.new_password) < 6:
        raise HTTPException(status_code=400, detail="Новый пароль должен быть не короче 6 символов")

    current_user.hashed_password = hash_password(data.new_password)
    db.commit()
    log_to_db(db, "info", "password_changed", user_id=current_user.id)
    return {"ok": True}


@router.post("/status")
def update_status(
    data: UserStatusSchema,
    current_user: User = Depends(get_current_user),
):
    if data.status not in ("online", "away", "offline"):
        raise HTTPException(status_code=400, detail="Неверный статус")
    set_user_status(current_user.id, data.status)
    return {"ok": True, "status": data.status}


@router.get("")
def list_users(
    search: str | None = Query(None),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    query = db.query(User).filter(User.id != current_user.id)

    if search:
        pattern = f"%{search}%"
        query = query.filter(
            (User.username.ilike(pattern))
            | (User.full_name.ilike(pattern))
            | (User.email.ilike(pattern))
        )

    users = query.order_by(User.full_name).all()

    return [
        {
            "id": user.id,
            "username": user.username,
            "full_name": user.full_name,
            "email": user.email,
            "role": user.role,
            "status": get_user_status(user.id),
            "online": get_user_status(user.id) == "online",
        }
        for user in users
    ]


@router.post("/register")
def register_user(
    data: UserRegisterSchema,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin()),
):
    if db.query(User).filter(User.email == data.email).first():
        raise HTTPException(status_code=400, detail="Email уже занят")

    if db.query(User).filter(User.username == data.username).first():
        raise HTTPException(status_code=400, detail="Логин уже занят")

    user = User(
        email=data.email,
        username=data.username,
        full_name=data.full_name,
        hashed_password=hash_password(data.password),
        role=data.role or "сотрудник",
    )
    db.add(user)
    db.commit()
    db.refresh(user)

    log_to_db(db, "info", "user_registered", user_id=current_user.id, details=data.username)

    return {
        "id": user.id,
        "username": user.username,
        "full_name": user.full_name,
        "role": user.role,
    }
