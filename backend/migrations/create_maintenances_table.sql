-- Migration script to create maintenances table
-- Run this script on your MariaDB database

CREATE TABLE IF NOT EXISTS maintenances (
    id INT PRIMARY KEY AUTO_INCREMENT,
    vehicle_id INT NOT NULL,
    maintenance_type ENUM('vidange', 'rotation_pneus', 'freins', 'changement_pneus', 'batterie', 'filtre_air', 'bougies', 'courroie_distribution', 'controle_technique', 'autre') NOT NULL DEFAULT 'autre',
    description TEXT,
    cost FLOAT NOT NULL,
    odometer_reading INT NOT NULL,
    maintenance_date DATE NOT NULL,
    service_provider VARCHAR(100),
    location VARCHAR(100),
    notes TEXT,
    next_maintenance_date DATE,
    next_maintenance_odometer INT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

    -- Foreign key constraint
    FOREIGN KEY (vehicle_id) REFERENCES vehicles(id) ON DELETE CASCADE,

    -- Indexes for better performance
    INDEX idx_vehicle_id (vehicle_id),
    INDEX idx_maintenance_date (maintenance_date),
    INDEX idx_maintenance_type (maintenance_type)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Verify the table was created
SELECT 'Maintenances table created successfully' AS status;
