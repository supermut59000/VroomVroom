-- VroomVroom Database Initialization Script
-- Date: 2025-12-09
-- Description: Complete database schema for vehicle management system

-- Set character set
SET NAMES utf8mb4;
SET FOREIGN_KEY_CHECKS = 0;

-- ============================================
-- TABLE: vehicles
-- ============================================
CREATE TABLE IF NOT EXISTS `vehicles` (
    `id` INT PRIMARY KEY AUTO_INCREMENT,

    -- Basic vehicle information
    `brand` VARCHAR(50) NOT NULL,
    `model` VARCHAR(50) NOT NULL,
    `year` INT NOT NULL,
    `license_plate` VARCHAR(20) UNIQUE NOT NULL,

    -- Technical information
    `initial_odometer` FLOAT NOT NULL DEFAULT 0.0,
    `tank_capacity` FLOAT NULL,
    `fuel_type` VARCHAR(20) NOT NULL,

    -- Acquisition information
    `acquisition_date` DATE NULL,
    `purchase_price` FLOAT NULL,

    -- Insurance mileage tracking
    `insurance_km_limit` FLOAT NULL COMMENT 'Initial kilometer limit from insurance',
    `insurance_km_annual_increase` FLOAT NULL COMMENT 'Annual kilometer increase (e.g., 20000)',
    `insurance_km_start_date` DATE NULL COMMENT 'Start date for insurance kilometer tracking',

    -- Metadata
    `description` TEXT NULL,
    `is_active` BOOLEAN NOT NULL DEFAULT TRUE,

    -- Timestamps
    `created_at` DATETIME DEFAULT CURRENT_TIMESTAMP,
    `updated_at` DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

    -- Indexes
    INDEX `idx_brand` (`brand`),
    INDEX `idx_license_plate` (`license_plate`),
    INDEX `idx_is_active` (`is_active`),
    INDEX `idx_insurance_start_date` (`insurance_km_start_date`)

) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================
-- TABLE: fuel_entries
-- ============================================
CREATE TABLE IF NOT EXISTS `fuel_entries` (
    `id` INT PRIMARY KEY AUTO_INCREMENT,

    -- Vehicle reference
    `vehicle_id` INT NOT NULL,

    -- Fuel details
    `fuel_type` ENUM('GASOLINE','DIESEL','ELECTRIC','HYBRID','LPG','E85') NOT NULL,
    `liters` FLOAT NOT NULL,
    `price_per_liter` FLOAT NOT NULL,
    `total_cost` FLOAT NOT NULL,

    -- Vehicle state
    `odometer_reading` INT NOT NULL,

    -- Location and context
    `station_name` VARCHAR(100) NULL,
    `location` VARCHAR(100) NULL,

    -- Date and notes
    `fueling_date` DATE NOT NULL,
    `is_full_tank` BOOLEAN NOT NULL DEFAULT TRUE COMMENT 'Whether this was a full tank fill-up',
    `notes` TEXT NULL,

    -- Timestamps
    `created_at` DATETIME DEFAULT CURRENT_TIMESTAMP,
    `updated_at` DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

    -- Foreign key
    FOREIGN KEY (`vehicle_id`) REFERENCES `vehicles`(`id`) ON DELETE CASCADE,

    -- Indexes
    INDEX `idx_vehicle_id` (`vehicle_id`),
    INDEX `idx_fueling_date` (`fueling_date`),
    INDEX `idx_fuel_type` (`fuel_type`),
    INDEX `idx_odometer_reading` (`odometer_reading`)

) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================
-- TABLE: maintenances
-- ============================================
CREATE TABLE IF NOT EXISTS `maintenances` (
    `id` INT PRIMARY KEY AUTO_INCREMENT,

    -- Vehicle reference
    `vehicle_id` INT NOT NULL,

    -- Maintenance details
    `maintenance_type` VARCHAR(100) NOT NULL,
    `description` TEXT NULL,
    `cost` FLOAT NOT NULL,

    -- Vehicle state
    `odometer_reading` INT NOT NULL,

    -- Service provider information
    `service_provider` VARCHAR(100) NULL,
    `location` VARCHAR(100) NULL,

    -- Date and notes
    `maintenance_date` DATE NOT NULL,
    `notes` TEXT NULL,

    -- Next maintenance reminder (optional)
    `next_maintenance_date` DATE NULL,
    `next_maintenance_odometer` INT NULL,

    -- Timestamps
    `created_at` DATETIME DEFAULT CURRENT_TIMESTAMP,
    `updated_at` DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

    -- Foreign key
    FOREIGN KEY (`vehicle_id`) REFERENCES `vehicles`(`id`) ON DELETE CASCADE,

    -- Indexes
    INDEX `idx_vehicle_id` (`vehicle_id`),
    INDEX `idx_maintenance_date` (`maintenance_date`),
    INDEX `idx_maintenance_type` (`maintenance_type`)

) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================
-- TABLE: flexfuel_conversions
-- ============================================
CREATE TABLE IF NOT EXISTS `flexfuel_conversions` (
    `id` INT PRIMARY KEY AUTO_INCREMENT,

    -- Vehicle reference
    `vehicle_id` INT NOT NULL,

    -- Conversion details
    `conversion_date` DATE NOT NULL,
    `kit_cost` FLOAT NOT NULL,
    `overconsumption_pct` FLOAT NOT NULL DEFAULT 20.0,
    `kit_brand` VARCHAR(100) NULL,
    `installer` VARCHAR(100) NULL,
    `notes` TEXT NULL,

    -- Timestamps
    `created_at` DATETIME DEFAULT CURRENT_TIMESTAMP,
    `updated_at` DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

    -- One conversion per vehicle
    UNIQUE KEY `uq_vehicle_id` (`vehicle_id`),
    FOREIGN KEY (`vehicle_id`) REFERENCES `vehicles`(`id`) ON DELETE CASCADE

) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================
-- TABLE: e10_reference_prices
-- ============================================
CREATE TABLE IF NOT EXISTS `e10_reference_prices` (
    `id` INT PRIMARY KEY AUTO_INCREMENT,

    -- Vehicle reference
    `vehicle_id` INT NOT NULL,

    -- Price details
    `reference_date` DATE NOT NULL,
    `price_per_liter` FLOAT NOT NULL,
    `notes` TEXT NULL,

    -- Timestamps
    `created_at` DATETIME DEFAULT CURRENT_TIMESTAMP,
    `updated_at` DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

    -- One price per vehicle per date
    UNIQUE KEY `uq_vehicle_date` (`vehicle_id`, `reference_date`),
    FOREIGN KEY (`vehicle_id`) REFERENCES `vehicles`(`id`) ON DELETE CASCADE,
    INDEX `idx_vehicle_date` (`vehicle_id`, `reference_date`)

) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

SET FOREIGN_KEY_CHECKS = 1;

-- Verify tables were created
SELECT 'Database initialization completed successfully' AS status;
SELECT
    TABLE_NAME,
    TABLE_ROWS,
    CREATE_TIME
FROM
    information_schema.TABLES
WHERE
    TABLE_SCHEMA = 'vehicle_management'
ORDER BY
    TABLE_NAME;
