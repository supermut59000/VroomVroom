-- Migration: add blend calculator fields to flexfuel_conversions
-- Run this on the live DB after deploying backend changes

ALTER TABLE `flexfuel_conversions`
  ADD COLUMN `target_ethanol_pct` FLOAT NOT NULL DEFAULT 77.0 COMMENT 'Target ethanol % in tank (e.g. 77 = 5L E10 + 40L E85 in 45L tank)',
  ADD COLUMN `ethanol_tolerance_pct` FLOAT NOT NULL DEFAULT 5.0 COMMENT 'Acceptable deviation from target ethanol % (e.g. 5 = ±5%)';
