"""unread messages per user

Revision ID: c3d4e5f6a7b8
Revises: b2c3d4e5f6a7
Create Date: 2026-06-06 20:00:00.000000
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "c3d4e5f6a7b8"
down_revision: Union[str, None] = "b2c3d4e5f6a7"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "chat_members",
        sa.Column("last_read_message_id", sa.Integer(), nullable=True),
    )
    op.create_foreign_key(
        "fk_chat_members_last_read_message",
        "chat_members",
        "messages",
        ["last_read_message_id"],
        ["id"],
    )


def downgrade() -> None:
    op.drop_constraint("fk_chat_members_last_read_message", "chat_members", type_="foreignkey")
    op.drop_column("chat_members", "last_read_message_id")
