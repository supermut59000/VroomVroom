-- Migration: add soft delete to fuel_entries and maintenances
-- Date: 2026-04-15

ALTER TABLE `fuel_entries`
    ADD COLUMN `is_active` BOOLEAN NOT NULL DEFAULT TRUE AFTER `notes`;

ALTER TABLE `maintenances`
    ADD COLUMN `is_active` BOOLEAN NOT NULL DEFAULT TRUE AFTER `next_maintenance_odometer`;
