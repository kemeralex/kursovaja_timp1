from datetime import datetime

from sqlalchemy.orm import Session

from app.models import ChatMember, Message, UserDeletedMessage


def get_membership(db: Session, user_id: int, chat_id: int) -> ChatMember | None:
    return (
        db.query(ChatMember)
        .filter(ChatMember.user_id == user_id, ChatMember.chat_id == chat_id)
        .first()
    )


def get_deleted_message_ids(db: Session, user_id: int, chat_id: int) -> set[int]:
    rows = (
        db.query(UserDeletedMessage.message_id)
        .join(Message, Message.id == UserDeletedMessage.message_id)
        .filter(
            UserDeletedMessage.user_id == user_id,
            Message.chat_id == chat_id,
        )
        .all()
    )
    return {row[0] for row in rows}


def filter_visible_messages(
    db: Session,
    user_id: int,
    chat_id: int,
    messages: list[Message],
    membership: ChatMember | None = None,
) -> list[Message]:
    if membership is None:
        membership = get_membership(db, user_id, chat_id)

    deleted_ids = get_deleted_message_ids(db, user_id, chat_id)
    cleared_before = membership.history_cleared_before if membership else None

    visible = []
    for message in messages:
        if message.id in deleted_ids:
            continue
        if cleared_before and message.created_at and message.created_at <= cleared_before:
            continue
        visible.append(message)

    return visible


def mark_message_deleted_for_user(db: Session, user_id: int, message_id: int) -> None:
    exists = (
        db.query(UserDeletedMessage)
        .filter(
            UserDeletedMessage.user_id == user_id,
            UserDeletedMessage.message_id == message_id,
        )
        .first()
    )
    if not exists:
        db.add(UserDeletedMessage(user_id=user_id, message_id=message_id))


def count_unread_messages(
    db: Session,
    user_id: int,
    chat_id: int,
    membership: ChatMember | None = None,
) -> int:
    if membership is None:
        membership = get_membership(db, user_id, chat_id)
    if not membership:
        return 0

    query = db.query(Message).filter(
        Message.chat_id == chat_id,
        Message.user_id != user_id,
    )
    if membership.last_read_message_id:
        query = query.filter(Message.id > membership.last_read_message_id)
    if membership.history_cleared_before:
        query = query.filter(Message.created_at > membership.history_cleared_before)

    deleted_ids = get_deleted_message_ids(db, user_id, chat_id)
    if deleted_ids:
        query = query.filter(~Message.id.in_(deleted_ids))

    return query.count()


def mark_chat_read(db: Session, user_id: int, chat_id: int, up_to_message_id: int | None = None) -> int:
    membership = get_membership(db, user_id, chat_id)
    if not membership:
        return 0

    if up_to_message_id:
        target_id = up_to_message_id
    else:
        last = (
            db.query(Message)
            .filter(Message.chat_id == chat_id)
            .order_by(Message.id.desc())
            .first()
        )
        target_id = last.id if last else 0

    if target_id and (
        not membership.last_read_message_id or target_id > membership.last_read_message_id
    ):
        membership.last_read_message_id = target_id

    return count_unread_messages(db, user_id, chat_id, membership=membership)


def clear_chat_history_for_user(db: Session, user_id: int, chat_id: int) -> None:
    membership = get_membership(db, user_id, chat_id)
    if not membership:
        return

    now = datetime.utcnow()
    membership.history_cleared_before = now

    messages = db.query(Message).filter(Message.chat_id == chat_id).all()
    for message in messages:
        mark_message_deleted_for_user(db, user_id, message.id)
