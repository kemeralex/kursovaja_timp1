"""Наполнение БД тестовыми данными для демонстрации KMB."""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.core.security import hash_password
from app.db import SessionLocal
from app.models import Chat, ChatMember, Message, User


def seed():
    db = SessionLocal()

    users_data = [
        ("admin@kmb.local", "admin", "Администратор Системы", "admin123", "admin"),
        ("mod@kmb.local", "moderator", "Модератор Иванов", "mod123", "модератор"),
        ("user1@kmb.local", "kemerov", "Кемеров Александр", "user123", "сотрудник"),
        ("user2@kmb.local", "boriskin", "Борискин Александр", "user123", "сотрудник"),
        ("user3@kmb.local", "matafonov", "Матафонов Артём", "user123", "бухгалтер"),
    ]

    users = []
    for email, username, full_name, password, role in users_data:
        existing = db.query(User).filter(User.email == email).first()
        if existing:
            users.append(existing)
            continue

        user = User(
            email=email,
            username=username,
            full_name=full_name,
            hashed_password=hash_password(password),
            role=role,
        )
        db.add(user)
        db.flush()
        users.append(user)

    db.commit()

    chat = db.query(Chat).filter(Chat.name == "Общий чат KMB").first()
    if not chat:
        chat = Chat(name="Общий чат KMB", type="group")
        db.add(chat)
        db.commit()
        db.refresh(chat)

        for index, user in enumerate(users):
            db.add(ChatMember(
                chat_id=chat.id,
                user_id=user.id,
                position="admin" if index == 0 else "member",
            ))

        messages = [
            (users[0], "Добро пожаловать в корпоративный мессенджер KMB!"),
            (users[2], "Привет! Проверяем реальное время."),
            (users[3], "Сообщения доставляются мгновенно."),
        ]
        for author, text in messages:
            db.add(Message(chat_id=chat.id, user_id=author.id, text=text, status="delivered"))

        db.commit()

    project_chat = db.query(Chat).filter(Chat.name == "Проект ТИМП").first()
    if not project_chat:
        project_chat = Chat(name="Проект ТИМП", type="group")
        db.add(project_chat)
        db.commit()
        db.refresh(project_chat)

        for user in users[1:]:
            db.add(ChatMember(chat_id=project_chat.id, user_id=user.id, position="member"))
        db.query(ChatMember).filter(
            ChatMember.chat_id == project_chat.id,
            ChatMember.user_id == users[1].id,
        ).update({"position": "admin"})
        db.commit()

    # личный чат между kemerov и boriskin
    if len(users) >= 4:
        u1, u2 = users[2], users[3]
        existing_private = None
        for chat in db.query(Chat).filter(Chat.type == "private").all():
            ids = {m.user_id for m in db.query(ChatMember).filter(ChatMember.chat_id == chat.id).all()}
            if ids == {u1.id, u2.id}:
                existing_private = chat
                break

        if not existing_private:
            private = Chat(name=u2.full_name, type="private")
            db.add(private)
            db.commit()
            db.refresh(private)
            db.add(ChatMember(chat_id=private.id, user_id=u1.id, position="member"))
            db.add(ChatMember(chat_id=private.id, user_id=u2.id, position="member"))
            db.add(Message(chat_id=private.id, user_id=u1.id, text="Привет! Это личная беседа.", status="delivered"))
            db.commit()

    db.close()
    print("Seed completed. Test accounts:")
    for email, username, _, password, role in users_data:
        print(f"  {username} / {password} ({role})")


if __name__ == "__main__":
    seed()
