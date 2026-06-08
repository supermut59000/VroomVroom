"""add missing columns and composite index

Revision ID: b2c3d4e5f6a7
Revises: 4eba94125b27
Create Date: 2026-06-08

Adds columns that exist in models but were never migrated to the live DB:
  - fuel_entries.is_active      (soft-delete flag)
  - fuel_entries.latitude       (GPS geolocation)
  - fuel_entries.longitude      (GPS geolocation)
  - maintenances.is_active      (soft-delete flag)
  - vehicles.insurance_unlimited (no km cap flag)

Also adds the composite index on (vehicle_id, is_active) for fuel_entries so
the frequent "active entries for vehicle" queries do a single range scan instead
of filtering a full per-vehicle scan.
"""
from alembic import op
import sqlalchemy as sa


revision = 'b2c3d4e5f6a7'
down_revision = '4eba94125b27'
branch_labels = None
depends_on = None


def upgrade():
    # ── fuel_entries ─────────────────────────────────────────────────────────
    op.add_column('fuel_entries', sa.Column('is_active', sa.Boolean(), nullable=False, server_default=sa.true()))
    op.add_column('fuel_entries', sa.Column('latitude', sa.Float(), nullable=True))
    op.add_column('fuel_entries', sa.Column('longitude', sa.Float(), nullable=True))

    op.create_index(
        'ix_fuel_entries_vehicle_active',
        'fuel_entries',
        ['vehicle_id', 'is_active'],
    )

    # ── maintenances ─────────────────────────────────────────────────────────
    op.add_column('maintenances', sa.Column('is_active', sa.Boolean(), nullable=False, server_default=sa.true()))

    # ── vehicles ─────────────────────────────────────────────────────────────
    op.add_column('vehicles', sa.Column('insurance_unlimited', sa.Boolean(), nullable=False, server_default=sa.false()))


def downgrade():
    op.drop_column('vehicles', 'insurance_unlimited')

    op.drop_column('maintenances', 'is_active')

    op.drop_index('ix_fuel_entries_vehicle_active', table_name='fuel_entries')
    op.drop_column('fuel_entries', 'longitude')
    op.drop_column('fuel_entries', 'latitude')
    op.drop_column('fuel_entries', 'is_active')
