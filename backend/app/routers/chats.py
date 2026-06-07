from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.core.logging_config import log_to_db
from app.core.redis_client import get_user_status
from app.dependencies.auth import get_current_user
from app.dependencies.db import get_db
from app.models import Chat, ChatMember, Message, User
from app.schemas import (
    AddUserByUsername,
    ChatCreateSchema,
    ChatMemberOut,
    MarkChatReadSchema,
    SetAdminSchema,
)
from app.utils.chat_admin import check_chat_admin
from app.utils.chat_permissions import check_chat_membership
from app.utils.message_visibility import (
    count_unread_messages,
    filter_visible_messages,
    mark_chat_read,
)

router = APIRouter(prefix="/chats", tags=["Chats"])


def _chat_display_name(db: Session, chat: Chat, current_user_id: int) -> str:
    if chat.type != "private":
        return chat.name

    other = (
        db.query(User)
        .join(ChatMember, ChatMember.user_id == User.id)
        .filter(ChatMember.chat_id == chat.id, User.id != current_user_id)
        .first()
    )
    return other.full_name if other else chat.name


def _message_preview(message: Message) -> str:
    if message.file_name and not message.text:
        return f"📎 {message.file_name}"
    if message.file_name:
        return f"{message.text} 📎"
    return message.text


def _last_visible_message_preview(
    db: Session, chat_id: int, user_id: int, membership: ChatMember
) -> dict | None:
    messages = (
        db.query(Message)
        .filter(Message.chat_id == chat_id)
        .order_by(Message.id.desc())
        .limit(100)
        .all()
    )
    visible = filter_visible_messages(db, user_id, chat_id, messages, membership=membership)
    if not visible:
        return None

    last = visible[0]
    return {
        "text": _message_preview(last),
        "created_at": last.created_at.isoformat() if last.created_at else None,
    }


@router.post("")
def create_chat(
    data: ChatCreateSchema,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    chat = Chat(name=data.name, type="group")
    db.add(chat)
    db.commit()
    db.refresh(chat)

    db.add(ChatMember(chat_id=chat.id, user_id=current_user.id, position="admin"))
    db.commit()

    log_to_db(db, "info", "chat_created", user_id=current_user.id, details=chat.name)
    return chat


@router.post("/direct/{user_id}")
def open_direct_chat(
    user_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if user_id == current_user.id:
        raise HTTPException(status_code=400, detail="Нельзя создать чат с самим собой")

    other = db.query(User).filter(User.id == user_id).first()
    if not other:
        raise HTTPException(status_code=404, detail="Пользователь не найден")

    my_chat_ids = [
        row[0]
        for row in db.query(ChatMember.chat_id).filter(ChatMember.user_id == current_user.id).all()
    ]

    for chat_id in my_chat_ids:
        chat = db.query(Chat).filter(Chat.id == chat_id, Chat.type == "private").first()
        if not chat:
            continue

        members = db.query(ChatMember).filter(ChatMember.chat_id == chat_id).all()
        member_ids = {m.user_id for m in members}
        if member_ids == {current_user.id, user_id}:
            my_membership = next(m for m in members if m.user_id == current_user.id)
            if my_membership.hidden_at is not None:
                my_membership.hidden_at = None
            if my_membership.left_at is not None:
                my_membership.left_at = None
            db.commit()
            return {
                "id": chat.id,
                "name": other.full_name,
                "type": "private",
            }

    chat = Chat(name=other.full_name, type="private")
    db.add(chat)
    db.commit()
    db.refresh(chat)

    db.add(ChatMember(chat_id=chat.id, user_id=current_user.id, position="member"))
    db.add(ChatMember(chat_id=chat.id, user_id=user_id, position="member"))
    db.commit()

    log_to_db(db, "info", "direct_chat_created", user_id=current_user.id, details=other.username)
    return {"id": chat.id, "name": other.full_name, "type": "private"}


@router.get("")
def get_chats(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    memberships = (
        db.query(ChatMember)
        .filter(
            ChatMember.user_id == current_user.id,
            ChatMember.hidden_at.is_(None),
        )
        .all()
    )

    if not memberships:
        return []

    membership_by_chat = {m.chat_id: m for m in memberships}
    chats = db.query(Chat).filter(Chat.id.in_(membership_by_chat.keys())).all()

    result = []
    for chat in chats:
        membership = membership_by_chat[chat.id]
        preview_data = _last_visible_message_preview(
            db, chat.id, current_user.id, membership
        )

        unread = count_unread_messages(
            db, current_user.id, chat.id, membership=membership
        )

        result.append({
            "id": chat.id,
            "name": _chat_display_name(db, chat, current_user.id),
            "type": chat.type or "group",
            "last_message": preview_data["text"] if preview_data else None,
            "last_message_at": preview_data["created_at"] if preview_data else None,
            "left_at": membership.left_at.isoformat() if membership.left_at else None,
            "unread_count": unread,
        })

    result.sort(key=lambda c: c["last_message_at"] or "", reverse=True)
    return result


@router.get("/{chat_id}")
def get_chat(
    chat_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    membership = check_chat_membership(db, current_user.id, chat_id)
    chat = db.query(Chat).filter(Chat.id == chat_id).first()
    if not chat:
        raise HTTPException(status_code=404, detail="Chat not found")

    return {
        "id": chat.id,
        "name": _chat_display_name(db, chat, current_user.id),
        "type": chat.type,
        "left_at": membership.left_at.isoformat() if membership.left_at else None,
    }


@router.post("/{chat_id}/add-by-username")
def add_user_by_username(
    chat_id: int,
    data: AddUserByUsername,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    chat = db.query(Chat).filter(Chat.id == chat_id).first()
    if chat and chat.type == "private":
        raise HTTPException(status_code=400, detail="В личный чат нельзя добавлять участников")

    check_chat_admin(db, current_user.id, chat_id)

    user = db.query(User).filter(User.username == data.username).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    exists = db.query(ChatMember).filter(
        ChatMember.chat_id == chat_id,
        ChatMember.user_id == user.id,
    ).first()
    if exists:
        raise HTTPException(status_code=400, detail="Already in chat")

    position = data.role if data.role in ("admin", "member") else "member"
    db.add(ChatMember(chat_id=chat_id, user_id=user.id, position=position))
    db.commit()

    log_to_db(db, "info", "member_added", user_id=current_user.id, details=data.username)
    return {"ok": True, "user_id": user.id}


@router.delete("/{chat_id}/members/{user_id}")
def remove_member(
    chat_id: int,
    user_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    chat = db.query(Chat).filter(Chat.id == chat_id).first()
    if chat and chat.type == "private":
        raise HTTPException(status_code=400, detail="Нельзя изменять состав личного чата")

    check_chat_admin(db, current_user.id, chat_id)

    member = db.query(ChatMember).filter(
        ChatMember.chat_id == chat_id,
        ChatMember.user_id == user_id,
    ).first()
    if not member:
        raise HTTPException(status_code=404, detail="Member not found")

    admins = db.query(ChatMember).filter(
        ChatMember.chat_id == chat_id,
        ChatMember.position == "admin",
    ).count()
    if member.position == "admin" and admins <= 1:
        raise HTTPException(status_code=400, detail="Cannot remove the last admin")

    db.delete(member)
    db.commit()
    log_to_db(db, "info", "member_removed", user_id=current_user.id, details=str(user_id))
    return {"ok": True}


@router.post("/{chat_id}/members/{user_id}/admin")
def set_admin(
    chat_id: int,
    user_id: int,
    data: SetAdminSchema,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    chat = db.query(Chat).filter(Chat.id == chat_id).first()
    if chat and chat.type == "private":
        raise HTTPException(status_code=400, detail="В личном чате нет администраторов")

    check_chat_admin(db, current_user.id, chat_id)

    member = db.query(ChatMember).filter(
        ChatMember.chat_id == chat_id,
        ChatMember.user_id == user_id,
    ).first()
    if not member:
        raise HTTPException(status_code=404, detail="Member not found")

    member.position = "admin" if data.is_admin else "member"
    db.commit()
    log_to_db(db, "info", "admin_changed", user_id=current_user.id, details=str(user_id))
    return {"ok": True, "position": member.position}


@router.get("/{chat_id}/members", response_model=list[ChatMemberOut])
def get_members(
    chat_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    check_chat_membership(db, current_user.id, chat_id)

    members = (
        db.query(ChatMember)
        .join(User, User.id == ChatMember.user_id)
        .filter(ChatMember.chat_id == chat_id)
        .all()
    )

    return [
        {
            "id": m.user.id,
            "username": m.user.username,
            "full_name": m.user.full_name,
            "chat_role": m.position,
            "role": m.user.role,
            "online": get_user_status(m.user.id) == "online",
            "status": get_user_status(m.user.id),
            "left_at": m.left_at.isoformat() if m.left_at else None,
        }
        for m in members
    ]


@router.post("/{chat_id}/read")
def mark_chat_as_read(
    chat_id: int,
    data: MarkChatReadSchema = MarkChatReadSchema(),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    check_chat_membership(db, current_user.id, chat_id)
    message_id = data.message_id
    unread = mark_chat_read(db, current_user.id, chat_id, up_to_message_id=message_id)
    db.commit()
    return {"ok": True, "unread_count": unread}


@router.post("/{chat_id}/leave")
def leave_chat(
    chat_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    chat = db.query(Chat).filter(Chat.id == chat_id).first()
    if not chat:
        raise HTTPException(status_code=404, detail="Chat not found")

    membership = check_chat_membership(db, current_user.id, chat_id)

    if membership.left_at is not None:
        return {"ok": True, "already_left": True}

    if chat.type == "private":
        raise HTTPException(
            status_code=400,
            detail="Из личной беседы нельзя выйти — удалите её из списка",
        )

    if membership.position == "admin":
        admins = db.query(ChatMember).filter(
            ChatMember.chat_id == chat_id,
            ChatMember.position == "admin",
            ChatMember.left_at.is_(None),
        ).count()
        if admins <= 1:
            raise HTTPException(
                status_code=400,
                detail="Назначьте другого администратора чата перед выходом",
            )

    membership.left_at = datetime.utcnow()
    db.commit()
    log_to_db(db, "info", "chat_left", user_id=current_user.id, details=str(chat_id))
    return {"ok": True}


@router.delete("/{chat_id}")
def hide_chat(
    chat_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    membership = (
        db.query(ChatMember)
        .filter(ChatMember.chat_id == chat_id, ChatMember.user_id == current_user.id)
        .first()
    )
    if not membership:
        raise HTTPException(status_code=404, detail="Chat not found")

    membership.hidden_at = datetime.utcnow()
    db.commit()
    log_to_db(db, "info", "chat_hidden", user_id=current_user.id, details=str(chat_id))
    return {"ok": True}
