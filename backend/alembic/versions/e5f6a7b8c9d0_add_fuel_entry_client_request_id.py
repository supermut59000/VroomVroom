"""add fuel entry client request id

Revision ID: e5f6a7b8c9d0
Revises: d4e5f6a7b8c9
Create Date: 2026-08-10
"""
from alembic import op
import sqlalchemy as sa


revision = 'e5f6a7b8c9d0'
down_revision = 'd4e5f6a7b8c9'
branch_labels = None
depends_on = None


def upgrade():
    op.add_column('fuel_entries', sa.Column('client_request_id', sa.String(length=36), nullable=True))
    op.create_unique_constraint(
        'uq_fuel_entries_client_request_id',
        'fuel_entries',
        ['client_request_id'],
    )


def downgrade():
    op.drop_constraint('uq_fuel_entries_client_request_id', 'fuel_entries', type_='unique')
    op.drop_column('fuel_entries', 'client_request_id')
