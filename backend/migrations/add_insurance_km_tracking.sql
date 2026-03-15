-- Migration: Add insurance mileage tracking columns to vehicles table
-- Date: 2025-12-09
-- Description: Add fields to track insurance kilometer limits with annual increases

ALTER TABLE vehicles
ADD COLUMN insurance_km_limit FLOAT NULL COMMENT 'Initial kilometer limit from insurance',
ADD COLUMN insurance_km_annual_increase FLOAT NULL COMMENT 'Annual kilometer increase (e.g., 20000)',
ADD COLUMN insurance_km_start_date DATE NULL COMMENT 'Start date for insurance kilometer tracking';

-- Add indexes for better query performance (optional but recommended)
CREATE INDEX idx_vehicles_insurance_start_date ON vehicles(insurance_km_start_date);

-- Example usage:
-- UPDATE vehicles
-- SET insurance_km_limit = 60000,
--     insurance_km_annual_increase = 20000,
--     insurance_km_start_date = '2024-01-01'
-- WHERE id = 1;
