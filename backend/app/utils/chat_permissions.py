from fastapi import HTTPException
from sqlalchemy.orm import Session

from app.models import ChatMember


def check_chat_membership(db: Session, user_id: int, chat_id: int) -> ChatMember:
    membership = (
        db.query(ChatMember)
        .filter(ChatMember.user_id == user_id, ChatMember.chat_id == chat_id)
        .first()
    )

    if not membership or membership.hidden_at is not None:
        raise HTTPException(status_code=403, detail="Access denied")

    return membership


def check_active_chat_membership(db: Session, user_id: int, chat_id: int) -> ChatMember:
    membership = check_chat_membership(db, user_id, chat_id)

    if membership.left_at is not None:
        raise HTTPException(
            status_code=403,
            detail="Вы вышли из этой беседы и не можете отправлять сообщения",
        )

    return membership
