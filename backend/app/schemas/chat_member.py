from pydantic import BaseModel
from datetime import datetime


class ChatMemberOutSchema(BaseModel):
    id: int
    user_id: int
    chat_id: int
    position: str
    added_at: datetime

    class Config:
        from_attributes = True