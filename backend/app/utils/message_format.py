def serialize_message(message, user):
    msg_type = getattr(message, "message_type", None) or "user"
    preview = message.text
    if not preview and message.file_name:
        preview = f"📎 {message.file_name}"

    return {
        "id": message.id,
        "chat_id": message.chat_id,
        "text": message.text,
        "file_url": message.file_url,
        "file_name": message.file_name,
        "sender_id": message.user_id,
        "user_id": message.user_id,
        "full_name": user.full_name if user else "",
        "sender_name": (user.username or user.email) if user else "",
        "role": user.role if user else "",
        "status": message.status,
        "created_at": message.created_at.isoformat() if message.created_at else None,
        "type": "system" if msg_type == "system" else "message",
        "message_type": msg_type,
        "preview": preview,
    }
