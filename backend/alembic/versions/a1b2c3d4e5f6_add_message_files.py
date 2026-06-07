"""add message files

Revision ID: a1b2c3d4e5f6
Revises: 7ef1fe6d8810
Create Date: 2026-06-06 12:00:00.000000
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "a1b2c3d4e5f6"
down_revision: Union[str, None] = "7ef1fe6d8810"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("messages", sa.Column("file_url", sa.String(), nullable=True))
    op.add_column("messages", sa.Column("file_name", sa.String(), nullable=True))


def downgrade() -> None:
    op.drop_column("messages", "file_name")
    op.drop_column("messages", "file_url")
