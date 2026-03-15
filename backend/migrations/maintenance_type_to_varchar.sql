-- Migration: change maintenance_type from ENUM to VARCHAR(100)
-- Allows user-defined maintenance types (e.g. "nettoyage", "lavomatique")
-- Existing data is preserved (enum values are stored as their string values)

ALTER TABLE maintenances
    MODIFY COLUMN maintenance_type VARCHAR(100) NOT NULL;
