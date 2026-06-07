from fastapi import HTTPException
from sqlalchemy.orm import Session

from app.models import ChatMember


def check_chat_admin(
    db: Session,
    user_id: int,
    chat_id: int
):
    membership = (
        db.query(ChatMember)
        .filter(
            ChatMember.user_id == user_id,
            ChatMember.chat_id == chat_id
        )
        .first()
    )

    if not membership:
        raise HTTPException(
            status_code=403,
            detail="You are not a member of this chat"
        )

    if membership.position != "admin":
        raise HTTPException(
            status_code=403,
            detail="Admin access required"
        )

    return membership