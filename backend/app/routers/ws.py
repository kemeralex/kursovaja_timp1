from fastapi import APIRouter, WebSocket, WebSocketDisconnect
from jose import JWTError, jwt
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.redis_client import set_user_status
from app.db import SessionLocal
from app.models import ChatMember, Message, User
from app.utils.chat_membership import unhide_chat_for_recipients
from app.utils.message_format import serialize_message
from app.websocket_manager import manager

router = APIRouter()


@router.websocket("/ws/{chat_id}")
async def websocket_endpoint(websocket: WebSocket, chat_id: int):
    token = websocket.query_params.get("token")
    if not token:
        await websocket.close(code=1008)
        return

    db: Session = SessionLocal()
    current_user = None

    try:
        payload = jwt.decode(token, settings.SECRET_KEY, algorithms=[settings.ALGORITHM])
        email = payload.get("sub")
        if not email:
            await websocket.close(code=1008)
            return

        current_user = db.query(User).filter(User.email == email).first()
        if not current_user:
            await websocket.close(code=1008)
            return

        membership = db.query(ChatMember).filter(
            ChatMember.chat_id == chat_id,
            ChatMember.user_id == current_user.id,
        ).first()
        if not membership or membership.hidden_at is not None:
            await websocket.close(code=1008)
            return

        await manager.connect(chat_id, websocket, current_user.id)
        set_user_status(current_user.id, "online")

        await manager.broadcast(
            chat_id,
            {
                "type": "status",
                "user_id": current_user.id,
                "full_name": current_user.full_name,
                "online": True,
                "status": "online",
            },
        )

        while True:
            data = await websocket.receive_json()
            event_type = data.get("type", "message")

            if event_type == "typing":
                await manager.broadcast(
                    chat_id,
                    {
                        "type": "typing",
                        "user_id": current_user.id,
                        "full_name": current_user.full_name,
                    },
                    exclude=websocket,
                )
                continue

            if event_type == "delivered":
                message_id = data.get("message_id")
                message = db.query(Message).filter(
                    Message.id == message_id,
                    Message.chat_id == chat_id,
                ).first()
                if message and message.status == "sent":
                    message.status = "delivered"
                    db.commit()
                    await manager.broadcast(
                        chat_id,
                        {
                            "type": "status_update",
                            "message_id": message.id,
                            "status": "delivered",
                        },
                    )
                continue

            if event_type == "read":
                message_ids = data.get("message_ids", [])
                updated = []
                for message_id in message_ids:
                    message = db.query(Message).filter(
                        Message.id == message_id,
                        Message.chat_id == chat_id,
                    ).first()
                    if message:
                        message.status = "read"
                        updated.append(message_id)
                if updated:
                    db.commit()
                    await manager.broadcast(
                        chat_id,
                        {
                            "type": "status_update",
                            "message_ids": updated,
                            "status": "read",
                        },
                    )
                continue

            text = data.get("message", "")
            file_url = data.get("file_url")
            file_name = data.get("file_name")

            if not text and not file_url:
                continue

            if membership.left_at is not None:
                continue

            message = Message(
                chat_id=chat_id,
                user_id=current_user.id,
                text=text,
                file_url=file_url,
                file_name=file_name,
                status="sent",
            )
            db.add(message)
            db.flush()
            unhide_chat_for_recipients(db, chat_id, current_user.id)
            db.commit()
            db.refresh(message)

            payload_message = serialize_message(message, current_user)
            await manager.broadcast(chat_id, payload_message)

    except WebSocketDisconnect:
        if current_user:
            manager.disconnect(chat_id, websocket, current_user.id)
            if not manager.is_user_online(current_user.id):
                set_user_status(current_user.id, "offline")
                await manager.broadcast(
                    chat_id,
                    {
                        "type": "status",
                        "user_id": current_user.id,
                        "full_name": current_user.full_name,
                        "online": False,
                        "status": "offline",
                    },
                )

    except JWTError:
        await websocket.close(code=1008)

    except Exception as exc:
        print("WS ERROR:", str(exc))
        await websocket.close(code=1011)

    finally:
        db.close()
