"""add vehicles.yearly_fixed_costs

Revision ID: d4e5f6a7b8c9
Revises: b2c3d4e5f6a7
Create Date: 2026-07-05

Yearly fixed costs (insurance premium, contrôle technique...) so the cost of
ownership section can include them instead of only purchase + fuel + maintenance.
"""
from alembic import op
import sqlalchemy as sa


revision = 'd4e5f6a7b8c9'
down_revision = 'b2c3d4e5f6a7'
branch_labels = None
depends_on = None


def upgrade():
    op.add_column('vehicles', sa.Column('yearly_fixed_costs', sa.Float(), nullable=True))


def downgrade():
    op.drop_column('vehicles', 'yearly_fixed_costs')
