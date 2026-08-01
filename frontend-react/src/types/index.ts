// Enums
export type FuelType = 'essence' | 'diesel' | 'electrique' | 'hybride' | 'gpl' | 'e85'

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
  yearly_fixed_costs: number | null
  insurance_km_limit: number | null
  insurance_km_annual_increase: number | null
  insurance_km_start_date: string | null
  insurance_unlimited: boolean
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
  insurance_unlimited: boolean
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
  yearly_fixed_costs?: number | null
  insurance_km_limit?: number | null
  insurance_km_annual_increase?: number | null
  insurance_km_start_date?: string | null
  insurance_unlimited?: boolean
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
  yearly_fixed_costs?: number | null
  insurance_km_limit?: number | null
  insurance_km_annual_increase?: number | null
  insurance_km_start_date?: string | null
  insurance_unlimited?: boolean
  description?: string | null
  is_active?: boolean
}

export interface SeasonStats {
  /** Distance-weighted L/100km for that season (total_liters/total_km × 100) */
  avg_consumption: number | null
  /** Lowest fill-to-fill L/100km recorded this season (best conditions) */
  min_consumption: number | null
  /** Highest fill-to-fill L/100km recorded this season (worst conditions) */
  max_consumption: number | null
  /** Fraction of E85 in fills added this season (0.0–1.0). null for non-FlexFuel. */
  e85_fraction: number | null
  /** Consumption normalised to pure E10 (null for non-FlexFuel) */
  e10_consumption: number | null
  /** Consumption normalised to pure E85 (null for non-FlexFuel) */
  e85_consumption: number | null
  /** Range on actual avg mix, 5 L cushion */
  range_km: number | null
  /** Range at min_consumption (best conditions) */
  range_km_best: number | null
  /** Range at max_consumption (worst conditions) */
  range_km_worst: number | null
  /** Range on pure E10 (null for non-FlexFuel) */
  range_km_e10: number | null
  /** Range on pure E85 (null for non-FlexFuel) */
  range_km_e85: number | null
  /** Number of fill-to-fill data points in this season */
  fill_count: number
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
  // Autonomy — overall + 4 meteorological seasons
  range_km: number | null
  spring: SeasonStats | null
  summer: SeasonStats | null
  autumn: SeasonStats | null
  winter: SeasonStats | null
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
  e85_fraction: number | null
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

// FlexFuel Conversion
export interface FlexfuelConversion {
  id: number
  vehicle_id: number
  conversion_date: string
  kit_cost: number
  overconsumption_pct: number
  kit_brand: string | null
  installer: string | null
  notes: string | null
  target_ethanol_pct: number
  ethanol_tolerance_pct: number
  created_at: string
  updated_at: string | null
}

export interface FlexfuelConversionCreate {
  vehicle_id: number
  conversion_date: string
  kit_cost: number
  overconsumption_pct?: number
  kit_brand?: string | null
  installer?: string | null
  notes?: string | null
  target_ethanol_pct?: number
  ethanol_tolerance_pct?: number
}

export interface FlexfuelConversionUpdate {
  conversion_date?: string
  kit_cost?: number
  overconsumption_pct?: number
  kit_brand?: string | null
  installer?: string | null
  notes?: string | null
  target_ethanol_pct?: number
  ethanol_tolerance_pct?: number
}

// E10 Reference Price (global, not per-vehicle)
export interface E10ReferencePrice {
  id: number
  reference_date: string
  price_per_liter: number
  notes: string | null
  created_at: string
  updated_at: string | null
}

export interface E10ReferencePriceCreate {
  reference_date: string
  price_per_liter: number
  notes?: string | null
}

// Bilan de période (2 dates → stats)
export interface FuelTypePeriodBreakdown {
  fuel_type: string
  liters: number
  total_cost: number
  avg_price_per_liter: number
}

export interface VehiclePeriodStats {
  vehicle_id: number
  start_date: string
  end_date: string
  days: number
  distance_km: number
  fill_count: number
  total_liters: number
  total_fuel_cost: number
  avg_consumption: number | null
  avg_price_per_liter: number | null
  fuel_breakdown: FuelTypePeriodBreakdown[]
  e85_savings: number | null
  e85_share_liters: number | null
  skipped_fills_no_e10_price: number
  fuel_cost_per_100km: number | null
  maintenance_cost: number
  maintenance_count: number
  cost_per_day: number | null
  km_per_day: number | null
}

// Vehicle Timeline
export interface VehicleTimelineEvent {
  event_type: 'fuel' | 'maintenance'
  event_date: string
  event_id: number
  odometer_reading: number
  data: Record<string, unknown>
}

export interface VehicleTimeline {
  vehicle_id: number
  events: VehicleTimelineEvent[]
}

// FlexFuel Rentability
export interface FlexfuelSavingsDataPoint {
  date: string
  e85_liters: number
  e85_cost: number
  equivalent_e10_liters: number
  e10_reference_price: number
  e10_equivalent_cost: number
  savings: number
  cumulative_savings: number
}

export interface FlexfuelMonthlySavings {
  month: string
  savings: number
}

export interface FlexfuelRentabilitySummary {
  vehicle_id: number
  kit_cost: number
  overconsumption_pct: number
  conversion_date: string
  total_e85_fills: number
  total_savings: number
  break_even_reached: boolean
  break_even_date: string | null
  monthly_average_savings: number | null
  skipped_fills_no_e10_price: number
  data_points: FlexfuelSavingsDataPoint[]
  monthly_savings: FlexfuelMonthlySavings[]
}

/** Road distance and driving time from a search origin to one station. */
export interface RouteLeg {
  /** null when the provider is unreachable or the point can't be routed to */
  distance_m: number | null
  duration_s: number | null
}

export interface RouteMatrix {
  legs: RouteLeg[]
  provider: string
  cached: boolean
}
