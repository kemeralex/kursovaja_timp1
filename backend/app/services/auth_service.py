from sqlalchemy.orm import Session

from app.models import User
from app.core.security import verify_password


def authenticate_user(
    db: Session,
    username: str,
    password: str
):
    user = db.query(User).filter(
        User.username == username
    ).first()

    if not user:
        return None

    if not verify_password(password, user.password):
        return None

    return user