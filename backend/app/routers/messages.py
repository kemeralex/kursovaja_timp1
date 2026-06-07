from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.core.logging_config import log_to_db
from app.dependencies.auth import get_current_user
from app.dependencies.db import get_db
from app.models import Message, User
from app.schemas import MessageCreateSchema, MessageFileSchema, MessageStatusUpdate
from app.utils.chat_permissions import check_active_chat_membership, check_chat_membership
from app.utils.message_format import serialize_message
from app.utils.chat_membership import unhide_chat_for_recipients
from app.utils.message_visibility import (
    clear_chat_history_for_user,
    filter_visible_messages,
    mark_message_deleted_for_user,
)

router = APIRouter(prefix="/messages", tags=["Messages"])


@router.post("")
def create_message(
    data: MessageCreateSchema,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    check_active_chat_membership(db=db, user_id=current_user.id, chat_id=data.chat_id)

    message = Message(
        chat_id=data.chat_id,
        user_id=current_user.id,
        text=data.text,
        status="sent",
    )
    db.add(message)
    db.flush()
    unhide_chat_for_recipients(db, data.chat_id, current_user.id)
    db.commit()
    db.refresh(message)

    return serialize_message(message, current_user)


@router.post("/file")
def create_file_message(
    data: MessageFileSchema,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    check_active_chat_membership(db=db, user_id=current_user.id, chat_id=data.chat_id)

    message = Message(
        chat_id=data.chat_id,
        user_id=current_user.id,
        text=data.text or "",
        file_url=data.file_url,
        file_name=data.file_name,
        status="sent",
    )
    db.add(message)
    db.flush()
    unhide_chat_for_recipients(db, data.chat_id, current_user.id)
    db.commit()
    db.refresh(message)

    return serialize_message(message, current_user)


@router.get("/{chat_id}")
def get_messages(
    chat_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    membership = check_chat_membership(db=db, user_id=current_user.id, chat_id=chat_id)

    messages = (
        db.query(Message)
        .filter(Message.chat_id == chat_id)
        .order_by(Message.created_at.asc())
        .all()
    )

    visible = filter_visible_messages(
        db, current_user.id, chat_id, messages, membership=membership
    )

    result = []
    for message in visible:
        user = db.query(User).filter(User.id == message.user_id).first()
        result.append(serialize_message(message, user))

    return result


@router.delete("/chat/{chat_id}/history")
def clear_chat_history(
    chat_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    check_chat_membership(db=db, user_id=current_user.id, chat_id=chat_id)
    clear_chat_history_for_user(db, current_user.id, chat_id)
    db.commit()
    log_to_db(db, "info", "chat_history_cleared", user_id=current_user.id, details=str(chat_id))
    return {"ok": True}


@router.delete("/{message_id}")
def delete_message_for_me(
    message_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    message = db.query(Message).filter(Message.id == message_id).first()
    if not message:
        raise HTTPException(status_code=404, detail="Сообщение не найдено")

    check_chat_membership(db=db, user_id=current_user.id, chat_id=message.chat_id)
    mark_message_deleted_for_user(db, current_user.id, message_id)
    db.commit()
    log_to_db(db, "info", "message_deleted_for_me", user_id=current_user.id, details=str(message_id))
    return {"ok": True}


@router.post("/status")
def update_message_status(
    data: MessageStatusUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    check_chat_membership(db=db, user_id=current_user.id, chat_id=data.chat_id)

    updated = []
    for message_id in data.message_ids:
        message = db.query(Message).filter(
            Message.id == message_id,
            Message.chat_id == data.chat_id,
        ).first()
        if not message:
            continue

        if data.status == "read" or (
            data.status == "delivered" and message.status == "sent"
        ):
            message.status = data.status
            updated.append(message_id)

    db.commit()
    return {"updated": updated, "status": data.status}
