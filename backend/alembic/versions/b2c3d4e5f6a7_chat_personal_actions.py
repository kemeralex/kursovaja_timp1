"""chat personal actions and message deletions

Revision ID: b2c3d4e5f6a7
Revises: a1b2c3d4e5f6
Create Date: 2026-06-06 18:00:00.000000
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "b2c3d4e5f6a7"
down_revision: Union[str, None] = "a1b2c3d4e5f6"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("chat_members", sa.Column("left_at", sa.DateTime(), nullable=True))
    op.add_column("chat_members", sa.Column("hidden_at", sa.DateTime(), nullable=True))
    op.add_column(
        "chat_members",
        sa.Column("history_cleared_before", sa.DateTime(), nullable=True),
    )

    op.create_table(
        "user_deleted_messages",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("user_id", sa.Integer(), nullable=False),
        sa.Column("message_id", sa.Integer(), nullable=False),
        sa.Column("deleted_at", sa.DateTime(), nullable=True),
        sa.ForeignKeyConstraint(["message_id"], ["messages.id"]),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"]),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("user_id", "message_id", name="uq_user_deleted_message"),
    )


def downgrade() -> None:
    op.drop_table("user_deleted_messages")
    op.drop_column("chat_members", "history_cleared_before")
    op.drop_column("chat_members", "hidden_at")
    op.drop_column("chat_members", "left_at")
