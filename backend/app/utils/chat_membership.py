from sqlalchemy.orm import Session

from app.models import ChatMember


def unhide_chat_for_recipients(db: Session, chat_id: int, sender_id: int) -> None:
    """Вернуть беседу в список у тех, кто скрыл её, когда приходит новое сообщение."""
    members = (
        db.query(ChatMember)
        .filter(
            ChatMember.chat_id == chat_id,
            ChatMember.user_id != sender_id,
            ChatMember.hidden_at.isnot(None),
        )
        .all()
    )
    for member in members:
        member.hidden_at = None
