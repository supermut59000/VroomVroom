-- Add insurance_unlimited flag to vehicles
-- Allows marking a vehicle as having no km cap on its insurance plan

ALTER TABLE vehicles
  ADD COLUMN insurance_unlimited BOOLEAN NOT NULL DEFAULT FALSE;
