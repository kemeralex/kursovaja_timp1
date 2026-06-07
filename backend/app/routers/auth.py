from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.security import OAuth2PasswordRequestForm
from sqlalchemy.orm import Session

from app.core.logging_config import log_to_db
from app.core.redis_client import cache_session, invalidate_session, set_user_status
from app.core.security import create_access_token, hash_password, verify_password
from app.dependencies.auth import get_current_user, get_token_payload, oauth2_scheme
from app.dependencies.db import get_db
from app.dependencies.rbac import get_login_mode, is_admin, is_effective_admin
from app.models import User
from app.schemas import ChangePasswordSchema

router = APIRouter(prefix="/auth", tags=["Auth"])


@router.post("/login")
def login(
    form_data: OAuth2PasswordRequestForm = Depends(),
    mode: str = Query("employee", description="employee | admin"),
    db: Session = Depends(get_db),
):
    user = db.query(User).filter(
        (User.email == form_data.username) | (User.username == form_data.username)
    ).first()

    if not user or not verify_password(form_data.password, user.hashed_password):
        log_to_db(db, "warning", "login_failed", details=form_data.username)
        raise HTTPException(status_code=401, detail="Неверный логин или пароль")

    login_mode = "admin" if mode == "admin" else "employee"

    if login_mode == "admin" and not is_admin(user):
        log_to_db(db, "warning", "login_admin_denied", user_id=user.id)
        raise HTTPException(
            status_code=403,
            detail="Этот аккаунт не является администратором (role в БД должен быть «admin»)",
        )

    token = create_access_token({
        "sub": user.email,
        "user_id": user.id,
        "role": getattr(user, "role", None),
        "login_mode": login_mode,
    })

    cache_session(token, user.id)
    set_user_status(user.id, "online")
    log_to_db(db, "info", "login_success", user_id=user.id, details=login_mode)

    return {"access_token": token, "token_type": "bearer", "login_mode": login_mode}


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
    }


@router.post("/logout")
def logout(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
    token: str = Depends(oauth2_scheme),
):
    invalidate_session(token)
    set_user_status(current_user.id, "offline")
    log_to_db(db, "info", "logout", user_id=current_user.id)
    return {"ok": True}


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
