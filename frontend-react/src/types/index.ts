// Enums
export type FuelType = 'essence' | 'diesel' | 'electrique' | 'hybride' | 'gpl'

// Preset values — backend now accepts any string (VARCHAR 100)
export type MaintenanceType = string

// Vehicle
export interface Vehicle {
  id: number
  brand: string
  model: string
  year: number
  license_plate: string
  fuel_type: FuelType
  initial_odometer: number
  tank_capacity: number | null
  acquisition_date: string | null
  purchase_price: number | null
  insurance_km_limit: number | null
  insurance_km_annual_increase: number | null
  insurance_km_start_date: string | null
  description: string | null
  is_active: boolean
  created_at: string
  updated_at: string | null
}

export interface VehicleList {
  id: number
  brand: string
  model: string
  year: number
  license_plate: string
  fuel_type: FuelType
  is_active: boolean
}

export interface VehicleCreate {
  brand: string
  model: string
  year: number
  license_plate: string
  fuel_type: FuelType
  initial_odometer: number
  tank_capacity?: number | null
  acquisition_date?: string | null
  purchase_price?: number | null
  insurance_km_limit?: number | null
  insurance_km_annual_increase?: number | null
  insurance_km_start_date?: string | null
  description?: string | null
  is_active?: boolean
}

export interface VehicleUpdate {
  brand?: string
  model?: string
  year?: number
  license_plate?: string
  fuel_type?: FuelType
  initial_odometer?: number
  tank_capacity?: number | null
  acquisition_date?: string | null
  purchase_price?: number | null
  insurance_km_limit?: number | null
  insurance_km_annual_increase?: number | null
  insurance_km_start_date?: string | null
  description?: string | null
  is_active?: boolean
}

export interface VehicleStats {
  vehicle_id: number
  total_fuel_entries: number
  total_distance: number
  total_fuel_quantity: number | null
  average_consumption: number | null
  average_fuel_price: number | null
  total_fuel_cost: number
  cost_per_km: number | null
  last_odometer: number | null
  days_since_last_entry: number | null
  current_insurance_km_limit: number | null
  insurance_km_remaining: number | null
  insurance_km_exceeded: boolean
}

export interface VehicleCostStats {
  thisMonth: number
  monthlyAverage: number
}

// Fuel Entry
export interface FuelEntry {
  id: number
  vehicle_id: number
  fuel_type: FuelType
  liters: number
  price_per_liter: number
  total_cost: number
  odometer_reading: number
  station_name: string | null
  location: string | null
  latitude: number | null
  longitude: number | null
  fueling_date: string
  is_full_tank: boolean
  notes: string | null
  created_at: string
  updated_at: string | null
}

export interface FuelEntryCreate {
  vehicle_id: number
  fuel_type: FuelType
  liters: number
  price_per_liter: number
  odometer_reading: number
  station_name?: string | null
  location?: string | null
  latitude?: number | null
  longitude?: number | null
  fueling_date: string
  is_full_tank?: boolean
  notes?: string | null
}

export interface FuelEntryUpdate {
  fuel_type?: FuelType
  liters?: number
  price_per_liter?: number
  odometer_reading?: number
  station_name?: string | null
  location?: string | null
  latitude?: number | null
  longitude?: number | null
  fueling_date?: string
  is_full_tank?: boolean
  notes?: string | null
}

export interface FuelEntryListResponse {
  entries: FuelEntry[]
  total: number
  page: number
  per_page: number
  pages: number
}

export interface FuelStatistics {
  total_entries: number
  total_liters: number
  total_cost: number
  average_price_per_liter: number
  total_distance: number
  average_consumption: number | null
}

export interface ConsumptionDataPoint {
  date: string
  consumption: number | null
  odometer_reading: number
  liters: number
  distance: number | null
  is_full_tank: boolean
}

export interface ConsumptionHistory {
  vehicle_id: number
  data_points: ConsumptionDataPoint[]
}

// Maintenance
export interface Maintenance {
  id: number
  vehicle_id: number
  maintenance_type: MaintenanceType
  description: string | null
  cost: number
  odometer_reading: number
  service_provider: string | null
  location: string | null
  maintenance_date: string
  notes: string | null
  next_maintenance_date: string | null
  next_maintenance_odometer: number | null
  created_at: string
  updated_at: string | null
}

export interface MaintenanceCreate {
  vehicle_id: number
  maintenance_type: MaintenanceType
  description?: string | null
  cost: number
  odometer_reading: number
  service_provider?: string | null
  location?: string | null
  maintenance_date: string
  notes?: string | null
  next_maintenance_date?: string | null
  next_maintenance_odometer?: number | null
}

export interface MaintenanceUpdate {
  maintenance_type?: MaintenanceType
  description?: string | null
  cost?: number
  odometer_reading?: number
  service_provider?: string | null
  location?: string | null
  maintenance_date?: string
  notes?: string | null
  next_maintenance_date?: string | null
  next_maintenance_odometer?: number | null
}

export interface MaintenanceStatistics {
  total_entries: number
  total_cost: number
  average_cost: number
  last_maintenance_date: string | null
  next_maintenance_date: string | null
}
