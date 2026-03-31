"""init

Revision ID: 4eba94125b27
Revises:
Create Date: 2026-03-31 14:55:57.115837

NOTE: This migration was hand-edited after auto-generation because:
  1. Some operations (e10_reference_prices, flexfuel_conversions, fuel_entries)
     ran before the original migration crashed at maintenances.
  2. The fuel_type ENUM→VARCHAR type change was removed — it is incorrect;
     the column is already the right ENUM type and Alembic's autogenerate
     cannot reliably compare custom SQLEnum with MySQL ENUM columns.
  3. The maintenances section was reordered: FK must be dropped BEFORE the
     index that backs it, or MySQL raises ER_DROP_INDEX_FK (1553).
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import mysql

# revision identifiers, used by Alembic.
revision: str = '4eba94125b27'
down_revision: Union[str, Sequence[str], None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema.

    The block for e10_reference_prices, flexfuel_conversions, and fuel_entries
    already ran successfully before this migration was interrupted; those
    operations are intentionally omitted here to avoid "already exists" errors.

    maintenances:  drop FK first so MySQL allows the index drop, then rename
                   indexes to Alembic's ix_* convention and recreate the FK.

    vehicles:      rename legacy hand-crafted indexes to ix_* convention.
                   fuel_type column type is NOT altered — it is already the
                   correct ENUM in the DB and Alembic's autogenerate comparison
                   is unreliable for custom enum types.
    """
    # ── maintenances ────────────────────────────────────────────────────────
    # Drop FK constraint BEFORE the index it relies on, otherwise MySQL errors.
    op.drop_constraint('maintenances_ibfk_1', 'maintenances', type_='foreignkey')
    op.drop_index('idx_vehicle_id', table_name='maintenances')

    op.create_index(op.f('ix_maintenances_id'), 'maintenances', ['id'], unique=False)
    op.create_index(op.f('ix_maintenances_maintenance_date'), 'maintenances', ['maintenance_date'], unique=False)
    op.create_index(op.f('ix_maintenances_vehicle_id'), 'maintenances', ['vehicle_id'], unique=False)

    op.create_foreign_key(None, 'maintenances', 'vehicles', ['vehicle_id'], ['id'])

    # ── vehicles ─────────────────────────────────────────────────────────────
    op.drop_index('idx_brand', table_name='vehicles')
    op.drop_index('idx_license_plate', table_name='vehicles')

    op.create_index(op.f('ix_vehicles_brand'), 'vehicles', ['brand'], unique=False)
    op.create_index(op.f('ix_vehicles_id'), 'vehicles', ['id'], unique=False)
    op.create_index(op.f('ix_vehicles_license_plate'), 'vehicles', ['license_plate'], unique=True)


def downgrade() -> None:
    """Downgrade schema."""
    # ── vehicles ─────────────────────────────────────────────────────────────
    op.drop_index(op.f('ix_vehicles_license_plate'), table_name='vehicles')
    op.drop_index(op.f('ix_vehicles_id'), table_name='vehicles')
    op.drop_index(op.f('ix_vehicles_brand'), table_name='vehicles')

    op.create_index('idx_license_plate', 'vehicles', ['license_plate'], unique=True)
    op.create_index('idx_brand', 'vehicles', ['brand'], unique=False)

    # ── maintenances ─────────────────────────────────────────────────────────
    op.drop_constraint(None, 'maintenances', type_='foreignkey')
    op.drop_index(op.f('ix_maintenances_vehicle_id'), table_name='maintenances')
    op.drop_index(op.f('ix_maintenances_maintenance_date'), table_name='maintenances')
    op.drop_index(op.f('ix_maintenances_id'), table_name='maintenances')

    op.create_index('idx_vehicle_id', 'maintenances', ['vehicle_id'], unique=False)
    op.create_index('idx_maintenance_type', 'maintenances', ['maintenance_type'], unique=False)
    op.create_index('idx_maintenance_date', 'maintenances', ['maintenance_date'], unique=False)

    op.create_foreign_key('maintenances_ibfk_1', 'maintenances', 'vehicles', ['vehicle_id'], ['id'], ondelete='CASCADE')
