-- Migration: Add E85 support and FlexFuel conversion tracking
-- Date: 2026-03-23

-- 1. Add 'e85' to fuel_type ENUM in vehicles and fuel_entries
ALTER TABLE `vehicles` MODIFY `fuel_type` ENUM('essence', 'diesel', 'electrique', 'hybride', 'gpl', 'e85') NOT NULL;
ALTER TABLE `fuel_entries` MODIFY `fuel_type` ENUM('essence', 'diesel', 'electrique', 'hybride', 'gpl', 'e85') NOT NULL;

-- 2. Create flexfuel_conversions table (one per vehicle)
CREATE TABLE IF NOT EXISTS `flexfuel_conversions` (
    `id` INT PRIMARY KEY AUTO_INCREMENT,
    `vehicle_id` INT NOT NULL,
    `conversion_date` DATE NOT NULL,
    `kit_cost` FLOAT NOT NULL,
    `overconsumption_pct` FLOAT NOT NULL DEFAULT 20.0,
    `kit_brand` VARCHAR(100) NULL,
    `installer` VARCHAR(100) NULL,
    `notes` TEXT NULL,
    `created_at` DATETIME DEFAULT CURRENT_TIMESTAMP,
    `updated_at` DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY `uq_vehicle_id` (`vehicle_id`),
    FOREIGN KEY (`vehicle_id`) REFERENCES `vehicles`(`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 3. Create e10_reference_prices table
CREATE TABLE IF NOT EXISTS `e10_reference_prices` (
    `id` INT PRIMARY KEY AUTO_INCREMENT,
    `vehicle_id` INT NOT NULL,
    `reference_date` DATE NOT NULL,
    `price_per_liter` FLOAT NOT NULL,
    `notes` TEXT NULL,
    `created_at` DATETIME DEFAULT CURRENT_TIMESTAMP,
    `updated_at` DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY `uq_vehicle_date` (`vehicle_id`, `reference_date`),
    FOREIGN KEY (`vehicle_id`) REFERENCES `vehicles`(`id`) ON DELETE CASCADE,
    INDEX `idx_vehicle_date` (`vehicle_id`, `reference_date`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

SELECT 'FlexFuel E85 migration completed successfully' AS status;
