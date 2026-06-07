import logging
import os
from datetime import datetime

from sqlalchemy.orm import Session

from app.models import Log


LOG_DIR = os.path.join(os.path.dirname(__file__), "..", "..", "logs")
os.makedirs(LOG_DIR, exist_ok=True)

LOG_FILE = os.path.join(LOG_DIR, "kmb.log")


def setup_logging():
    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
        handlers=[
            logging.FileHandler(LOG_FILE, encoding="utf-8"),
            logging.StreamHandler(),
        ],
    )


def log_to_db(
    db: Session,
    level: str,
    event_type: str,
    user_id: int | None = None,
    details: str | None = None,
):
    logger = logging.getLogger("kmb")
    message = f"{event_type}" + (f" — {details}" if details else "")

    if level == "info":
        logger.info(message)
    elif level == "warning":
        logger.warning(message)
    else:
        logger.error(message)

    entry = Log(
        event_type=f"{level}:{event_type}",
        user_id=user_id,
        created_at=datetime.utcnow(),
    )
    db.add(entry)
    db.commit()
