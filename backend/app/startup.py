import logging

from sqlalchemy import inspect, text
from sqlalchemy.orm import Session

from app.db import SessionLocal, engine
from app.models import ChatMember, Message, User

logger = logging.getLogger("kmb")


def check_db_integrity() -> bool:
    db: Session = SessionLocal()
    ok = True

    try:
        db.execute(text("SELECT 1"))

        orphaned_messages = (
            db.query(Message)
            .outerjoin(ChatMember, (ChatMember.chat_id == Message.chat_id) & (ChatMember.user_id == Message.user_id))
            .filter(ChatMember.id.is_(None))
            .count()
        )

        if orphaned_messages:
            logger.warning("Integrity check: %s messages without chat membership", orphaned_messages)
            ok = False

        users_without_email = db.query(User).filter(User.email.is_(None)).count()
        if users_without_email:
            logger.warning("Integrity check: %s users without email", users_without_email)
            ok = False

        if ok:
            logger.info("Database integrity check passed")
        else:
            logger.warning("Database integrity check completed with warnings")

    except Exception as exc:
        logger.error("Database integrity check failed: %s", exc)
        ok = False
    finally:
        db.close()

    return ok


def on_startup():
    if inspect(engine).has_table("users"):
        check_db_integrity()
    logger.info("KMB backend started")
