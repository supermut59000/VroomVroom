-- Migration: Add GPS coordinates to fuel_entries table
-- Run with: docker exec -i mariadb mysql -u vehicleadmin -pvehiclepassword vehicle_management < add_lat_lng_fuel_entries.sql

ALTER TABLE fuel_entries
  ADD COLUMN latitude DOUBLE NULL AFTER location,
  ADD COLUMN longitude DOUBLE NULL AFTER latitude;
