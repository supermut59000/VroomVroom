"""add SP98 fuel type

Revision ID: f6a7b8c9d0e1
Revises: e5f6a7b8c9d0
Create Date: 2026-08-15
"""
from alembic import op


revision = 'f6a7b8c9d0e1'
down_revision = 'e5f6a7b8c9d0'
branch_labels = None
depends_on = None


_FUEL_TYPES = "'GASOLINE','DIESEL','ELECTRIC','HYBRID','LPG','E85'"


def upgrade():
    op.execute(
        f"ALTER TABLE fuel_entries MODIFY fuel_type ENUM({_FUEL_TYPES},'SP98') NOT NULL"
    )


def downgrade():
    op.execute("UPDATE fuel_entries SET fuel_type='GASOLINE' WHERE fuel_type='SP98'")
    op.execute(
        f"ALTER TABLE fuel_entries MODIFY fuel_type ENUM({_FUEL_TYPES}) NOT NULL"
    )
