"""Ежедневное резервное копирование PostgreSQL (запускать по cron/Task Scheduler)."""

import os
import subprocess
from datetime import datetime
from pathlib import Path

BACKUP_DIR = Path(__file__).resolve().parents[1] / "backups"
BACKUP_DIR.mkdir(exist_ok=True)

timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
output = BACKUP_DIR / f"kmb_backup_{timestamp}.sql"

cmd = [
    "pg_dump",
    "-h", os.getenv("POSTGRES_HOST", "localhost"),
    "-p", os.getenv("POSTGRES_PORT", "5432"),
    "-U", os.getenv("POSTGRES_USER", "kmb_user"),
    "-d", os.getenv("POSTGRES_DB", "kmb_db"),
    "-f", str(output),
]

env = os.environ.copy()
env["PGPASSWORD"] = os.getenv("POSTGRES_PASSWORD", "")

subprocess.run(cmd, env=env, check=True)
print(f"Backup saved to {output}")
