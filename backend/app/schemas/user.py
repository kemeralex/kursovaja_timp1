from pydantic import BaseModel, EmailStr


class UserCreateSchema(BaseModel):
    full_name: str
    email: EmailStr
    password: str


class UserOutSchema(BaseModel):
    id: int
    full_name: str
    email: EmailStr
    role: str

    class Config:
        from_attributes = True