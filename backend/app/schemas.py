from pydantic import BaseModel
from datetime import datetime


class ChatMemberOut(BaseModel):
    id: int
    username: str
    full_name: str | None = None
    chat_role: str
    role: str
    online: bool = False
    status: str = "offline"

    class Config:
        from_attributes = True

class LoginSchema(BaseModel):
    username: str
    password: str


class ChatCreateSchema(BaseModel):
    name: str


class MessageCreateSchema(BaseModel):
    text: str
    chat_id: int


class UserResponseSchema(BaseModel):
    id: int
    username: str

    class Config:
        from_attributes = True


class ChatResponseSchema(BaseModel):
    id: int
    name: str

    class Config:
        from_attributes = True


class MessageResponseSchema(BaseModel):
    id: int
    text: str
    created_at: datetime

    user_id: int
    sender_name: str

    class Config:
        from_attributes = True


class AddUserByUsername(BaseModel):
    username: str
    role: str | None = "member"


class SetAdminSchema(BaseModel):
    is_admin: bool = True


class MessageStatusUpdate(BaseModel):
    chat_id: int
    message_ids: list[int]
    status: str


class ChangePasswordSchema(BaseModel):
    old_password: str
    new_password: str


class UserRegisterSchema(BaseModel):
    email: str
    username: str
    full_name: str
    password: str
    role: str = "user"


class UserStatusSchema(BaseModel):
    status: str


class MessageFileSchema(BaseModel):
    chat_id: int
    text: str = ""
    file_url: str
    file_name: str


class MarkChatReadSchema(BaseModel):
    message_id: int | None = None
