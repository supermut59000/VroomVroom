-- Migration: add soft-delete to flexfuel_conversions and e10_reference_prices
-- Run this once on the live DB after deploying the new code.

ALTER TABLE flexfuel_conversions
    ADD COLUMN is_active BOOLEAN NOT NULL DEFAULT TRUE;

ALTER TABLE e10_reference_prices
    ADD COLUMN is_active BOOLEAN NOT NULL DEFAULT TRUE;
