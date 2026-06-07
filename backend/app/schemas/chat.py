from pydantic import BaseModel
from pydantic import BaseModel

class AddUserByUsername(BaseModel):
    username: str
    

class ChatCreateSchema(BaseModel):
    name: str


class ChatOutSchema(BaseModel):
    id: int
    name: str
    type: str

    class Config:
        from_attributes = True