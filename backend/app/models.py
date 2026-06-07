from sqlalchemy import Column, Integer, String, ForeignKey, DateTime, Text
from sqlalchemy.orm import relationship
from datetime import datetime
from app.db import Base


# =========================
# USER
# =========================
class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True)
    email = Column(String, unique=True, index=True)
    username = Column(String, unique=True, nullable=True)
    full_name = Column(String)

    hashed_password = Column(String)
    role = Column(String)

    memberships = relationship("ChatMember", back_populates="user")
    messages = relationship("Message", back_populates="user")
    sessions = relationship("DBSession", back_populates="user")
    logs = relationship("Log", back_populates="user")


# =========================
# CHAT
# =========================
class Chat(Base):
    __tablename__ = "chats"

    id = Column(Integer, primary_key=True)
    name = Column(String, nullable=False)

    type = Column(String, default="group")
    avatar_url = Column(String, nullable=True)

    created_at = Column(DateTime, default=datetime.utcnow)

    messages = relationship("Message", back_populates="chat")
    members = relationship("ChatMember", back_populates="chat")


# =========================
# CHAT MEMBER
# =========================
class ChatMember(Base):
    __tablename__ = "chat_members"

    id = Column(Integer, primary_key=True)

    chat_id = Column(Integer, ForeignKey("chats.id"))
    user_id = Column(Integer, ForeignKey("users.id"))

    position = Column(String, default="member")
    added_at = Column(DateTime, default=datetime.utcnow)
    left_at = Column(DateTime, nullable=True)
    hidden_at = Column(DateTime, nullable=True)
    history_cleared_before = Column(DateTime, nullable=True)
    last_read_message_id = Column(Integer, ForeignKey("messages.id"), nullable=True)

    user = relationship("User", back_populates="memberships")
    chat = relationship("Chat", back_populates="members")


# =========================
# MESSAGE
# =========================
class Message(Base):
    __tablename__ = "messages"

    id = Column(Integer, primary_key=True)

    chat_id = Column(Integer, ForeignKey("chats.id"))
    user_id = Column(Integer, ForeignKey("users.id"))

    text = Column(Text, nullable=False, default="")

    file_url = Column(String, nullable=True)
    file_name = Column(String, nullable=True)

    created_at = Column(DateTime, default=datetime.utcnow)
    status = Column(String, default="sent")

    user = relationship("User", back_populates="messages")
    chat = relationship("Chat", back_populates="messages")


# =========================
# USER DELETED MESSAGE (удаление «для себя»)
# =========================
class UserDeletedMessage(Base):
    __tablename__ = "user_deleted_messages"

    id = Column(Integer, primary_key=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    message_id = Column(Integer, ForeignKey("messages.id"), nullable=False)
    deleted_at = Column(DateTime, default=datetime.utcnow)


# =========================
# SESSION (ВАЖНО — БЫЛА ПРОБЛЕМА)
# =========================
class DBSession(Base):
    __tablename__ = "sessions"

    id = Column(Integer, primary_key=True)

    user_id = Column(Integer, ForeignKey("users.id"))
    token = Column(String, nullable=False)

    created_at = Column(DateTime, default=datetime.utcnow)
    expires_at = Column(DateTime, nullable=True)

    user = relationship("User", back_populates="sessions")


# =========================
# LOG
# =========================
class Log(Base):
    __tablename__ = "logs"

    id = Column(Integer, primary_key=True)

    event_type = Column(String, nullable=False)
    user_id = Column(Integer, ForeignKey("users.id"))

    created_at = Column(DateTime, default=datetime.utcnow)

    user = relationship("User", back_populates="logs")