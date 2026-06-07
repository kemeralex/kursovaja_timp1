from fastapi import Depends, HTTPException

from app.dependencies.auth import get_current_user, get_token_payload
from app.models import User


def is_admin(user: User) -> bool:
    return (user.role or "").lower() == "admin"


def get_login_mode(payload: dict) -> str:
    return payload.get("login_mode", "employee")


def is_effective_admin(user: User, login_mode: str) -> bool:
    return login_mode == "admin" and is_admin(user)


def require_admin():
    def checker(
        current_user: User = Depends(get_current_user),
        payload: dict = Depends(get_token_payload),
    ):
        if not is_effective_admin(current_user, get_login_mode(payload)):
            raise HTTPException(status_code=403, detail="Доступ только для администратора")
        return current_user

    return checker
