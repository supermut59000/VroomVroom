# VroomVroom — Architecture Reference

Comprehensive codebase reference for AI and developers.
Generated: 2026-05-12

---

## API Endpoints (39 total)

All routes prefix with `/api/v1` and use optional `X-API-Key` auth (configured as router-level dependency).

### Vehicles — prefix `/vehicles`

| # | Method | Path | Purpose |
|---|--------|------|---------|
| 1 | GET | `/` | List vehicles (filters: active_only, fuel_type, skip, limit) |
| 2 | POST | `/` | Create vehicle (409 if license plate exists) |
| 3 | GET | `/{vehicle_id}` | Get single vehicle by ID |
| 4 | PUT | `/{vehicle_id}` | Update vehicle (409 if plate collides) |
| 5 | DELETE | `/{vehicle_id}` | Soft-delete (`is_active=False`; `?force=true` for hard delete) |
| 6 | GET | `/stats/batch` | Stats for ALL active vehicles in one call (`dict[int, VehicleStats]`) |
| 7 | GET | `/{vehicle_id}/stats` | Statistics for single vehicle |
| 8 | GET | `/{vehicle_id}/timeline` | Unified chronological feed: fuel + maintenance merged, sorted desc |
| 9 | POST | `/{vehicle_id}/archive` | Archive vehicle (`is_active=False`) |

### Fuel Entries — prefix `/fuel-entries`

| # | Method | Path | Purpose |
|---|--------|------|---------|
| 10 | POST | `/` | Create fuel entry |
| 11 | GET | `/` | List with filters, pagination, ordering |
| 12 | GET | `/stations` | Distinct station names (optional `?vehicle_id=`) |
| 13 | GET | `/{entry_id}` | Get specific fuel entry |
| 14 | PUT | `/{entry_id}` | Update fuel entry |
| 15 | DELETE | `/{entry_id}` | Soft-delete (`is_active=False`) |
| 16 | GET | `/vehicle/{vehicle_id}/nearest-station` | Closest known station within `radius_m` from `lat/lon` via haversine |
| 17 | GET | `/vehicle/{vehicle_id}` | All entries for vehicle (paginated) |
| 18 | GET | `/vehicle/{vehicle_id}/latest` | Most recent fuel entry |
| 19 | GET | `/vehicle/{vehicle_id}/statistics` | Fuel statistics (consumption, totals, averages) |
| 20 | GET | `/vehicle/{vehicle_id}/consumption-history` | L/100km per fill-up for charts |

### Maintenances — prefix `/maintenances`

| # | Method | Path | Purpose |
|---|--------|------|---------|
| 21 | POST | `/` | Create maintenance entry |
| 22 | GET | `/` | List with filters, pagination, ordering |
| 23 | GET | `/{maintenance_id}` | Get specific maintenance |
| 24 | PUT | `/{maintenance_id}` | Update maintenance |
| 25 | DELETE | `/{maintenance_id}` | Soft-delete (`is_active=False`) |
| 26 | GET | `/vehicle/{vehicle_id}` | All entries for vehicle (paginated) |
| 27 | GET | `/vehicle/{vehicle_id}/latest` | Latest maintenance for vehicle |
| 28 | GET | `/vehicle/{vehicle_id}/statistics` | Maintenance statistics |

### FlexFuel — prefix `/flexfuel`

| # | Method | Path | Purpose |
|---|--------|------|---------|
| 29 | POST | `/vehicles/{vehicle_id}/conversion` | Record FlexFuel conversion (409 if exists) |
| 30 | GET | `/vehicles/{vehicle_id}/conversion` | Get conversion for vehicle |
| 31 | PUT | `/vehicles/{vehicle_id}/conversion` | Update conversion |
| 32 | DELETE | `/vehicles/{vehicle_id}/conversion` | Hard-delete conversion |
| 33 | POST | `/e10-prices` | Add global E10 reference price |
| 34 | GET | `/e10-prices` | List all E10 reference prices |
| 35 | PUT | `/e10-prices/{price_id}` | Update E10 price |
| 36 | DELETE | `/e10-prices/{price_id}` | Hard-delete E10 price |
| 37 | GET | `/vehicles/{vehicle_id}/rentability` | Calculate E85 rentability (break-even, savings) |

### Root (in `main.py`, outside `/api/v1`)

| # | Method | Path | Purpose |
|---|--------|------|---------|
| 38 | GET | `/` | API root — name + version |
| 39 | GET | `/health` | Health check — pings DB, returns `{"status":"healthy"/"unhealthy"}` |

---

## Pydantic Schemas

### Vehicle Schemas (`schemas/vehicle.py`)

#### VehicleBase
| Field | Type | Required | Notes |
|-------|------|----------|-------|
| brand | str (1-50) | Yes | auto-titlecased |
| model | str (1-50) | Yes | auto-titlecased |
| year | int (1900-2030) | Yes | |
| license_plate | str (2-20) | Yes | auto-uppercased |
| fuel_type | FuelType enum | Yes | |
| initial_odometer | float (>=0) | No (default 0.0) | |
| tank_capacity | float (>0) | Optional | |
| acquisition_date | date | Optional | |
| purchase_price | float (>=0) | Optional | |
| insurance_km_limit | float (>=0) | Optional | Initial km limit |
| insurance_km_annual_increase | float (>=0) | Optional | Annual km increase |
| insurance_km_start_date | date | Optional | Start of tracking |
| insurance_unlimited | bool | No (default False) | No km cap |
| description | str (max 1000) | Optional | |
| is_active | bool | No (default True) | |

**VehicleCreate** = VehicleBase (no extras)
**VehicleUpdate** = all VehicleBase fields, but ALL optional
**VehicleResponse** = VehicleBase + `id`, `created_at`, `updated_at`
**VehicleList** = lightweight: `id`, `brand`, `model`, `year`, `license_plate`, `fuel_type`, `is_active`, `insurance_unlimited`

#### SeasonStats
| Field | Type | Notes |
|-------|------|-------|
| avg_consumption | float\|None | Distance-weighted L/100km |
| min_consumption | float\|None | Best segment L/100km |
| max_consumption | float\|None | Worst segment L/100km |
| e85_fraction | float\|None | Fraction of E85 in fills (0.0-1.0) |
| e10_consumption | float\|None | Normalized to pure E10 |
| e85_consumption | float\|None | Normalized to pure E85 |
| range_km | float\|None | (tank-5L) * 100 / avg_consumption |
| range_km_best | float\|None | (tank-5L) * 100 / min_consumption |
| range_km_worst | float\|None | (tank-5L) * 100 / max_consumption |
| range_km_e10 | float\|None | (tank-5L) * 100 / e10_consumption |
| range_km_e85 | float\|None | (tank-5L) * 100 / e85_consumption |
| fill_count | int (default 0) | Reliability indicator |

#### VehicleStats
| Field | Type | Notes |
|-------|------|-------|
| vehicle_id | int | |
| total_fuel_entries | int | |
| total_distance | float | Last odometer - initial odometer |
| total_fuel_quantity | float\|None | Sum of all liters |
| average_consumption | float\|None | Full-tank-only avg L/100km |
| average_fuel_price | float\|None | Total cost / total liters |
| total_fuel_cost | float | Sum of all fuel costs |
| cost_per_km | float\|None | Total fuel cost / total distance |
| last_odometer | float\|None | Most recent odometer reading |
| days_since_last_entry | int\|None | Days since last fuel entry |
| current_insurance_km_limit | float\|None | Calculated current insurance limit |
| insurance_km_remaining | float\|None | Limit - current odometer |
| insurance_km_exceeded | bool (default False) | |
| range_km | float\|None | Overall range (tank-5L cushion) |
| spring | SeasonStats\|None | |
| summer | SeasonStats\|None | |
| autumn | SeasonStats\|None | |
| winter | SeasonStats\|None | |

#### Timeline
| Schema | Fields |
|--------|--------|
| VehicleTimelineEvent | `event_type: "fuel" \| "maintenance"`, `event_date`, `event_id`, `odometer_reading`, `data: dict` |
| VehicleTimeline | `vehicle_id`, `events: list[VehicleTimelineEvent]` |

### Fuel Entry Schemas (`schemas/fuel_entry.py`)

#### FuelEntryBase
| Field | Type | Required | Notes |
|-------|------|----------|-------|
| vehicle_id | int (>=1) | Yes | |
| fuel_type | FuelType enum | Yes | |
| liters | float (>0, <=200) | Yes | |
| price_per_liter | float (>0, <=10) | Yes | |
| odometer_reading | int (>=0, <=9999999) | Yes | |
| station_name | str (max 100) | Optional | |
| location | str (max 100) | Optional | |
| latitude | float (-90..90) | Optional | GPS |
| longitude | float (-180..180) | Optional | GPS |
| fueling_date | date | No (default today) | |
| is_full_tank | bool | No (default True) | Critical for consumption calc |
| notes | str (max 500) | Optional | |

Validators: `liters > 0`, `price_per_liter > 0`, `odometer_reading >= 0`.

**FuelEntryCreate** = FuelEntryBase (no extras)
**FuelEntryUpdate** = all fields except vehicle_id, ALL optional
**FuelEntryResponse** = FuelEntryBase + `id`, `total_cost` (liters * price_per_liter), `created_at`, `updated_at`
**FuelEntryListResponse** = `entries: list[FuelEntryResponse]`, `total`, `page`, `per_page`, `pages`

#### FuelStatisticsResponse
| Field | Type | Notes |
|-------|------|-------|
| total_entries | int | |
| total_liters | float | |
| total_cost | float | |
| average_price_per_liter | float | total_cost / total_liters |
| total_distance | int | last - first odometer |
| average_consumption | float\|None | Full-tank-only L/100km |

#### ConsumptionHistory
| Schema | Fields |
|--------|--------|
| ConsumptionDataPoint | `date`, `consumption: float\|None`, `odometer_reading`, `liters`, `distance: int\|None`, `is_full_tank` |
| ConsumptionHistoryResponse | `vehicle_id`, `data_points: list[ConsumptionDataPoint]` |

### Maintenance Schemas (`schemas/maintenance.py`)

#### MaintenanceBase
| Field | Type | Required | Notes |
|-------|------|----------|-------|
| vehicle_id | int (>=1) | Yes | |
| maintenance_type | str (1-100) | Yes | Not enum-validated (accepts any string) |
| description | str (max 500) | Optional | |
| cost | float (>=0, <=100000) | Yes | |
| odometer_reading | int (>=0, <=9999999) | Yes | |
| service_provider | str (max 100) | Optional | |
| location | str (max 100) | Optional | |
| maintenance_date | date | No (default today) | |
| notes | str (max 500) | Optional | |
| next_maintenance_date | date | Optional | Reminder for next service |
| next_maintenance_odometer | int (>=0, <=9999999) | Optional | Reminder for next service |

**MaintenanceCreate** = MaintenanceBase
**MaintenanceUpdate** = all fields optional
**MaintenanceResponse** = MaintenanceBase + `id`, `created_at`, `updated_at`
**MaintenanceListResponse** = `entries`, `total`, `page`, `per_page`, `pages`
**MaintenanceStatisticsResponse** = `total_entries`, `total_cost`, `average_cost`, `last_maintenance_date`, `next_maintenance_date`

### FlexFuel Schemas (`schemas/flexfuel.py`)

#### FlexfuelConversionBase
| Field | Type | Required | Notes |
|-------|------|----------|-------|
| conversion_date | date | Yes | |
| kit_cost | float (>0) | Yes | EUR |
| overconsumption_pct | float (>0, <=100) | No (default 20.0) | E85 overconsumption vs E10 |
| kit_brand | str (max 100) | Optional | |
| installer | str (max 100) | Optional | |
| notes | str | Optional | |
| target_ethanol_pct | float (0-100) | No (default 77.0) | Target ethanol % for blend |
| ethanol_tolerance_pct | float (0-20) | No (default 5.0) | Acceptable deviation |

**FlexfuelConversionCreate** = Base + `vehicle_id: int (>=1)` (required)
**FlexfuelConversionUpdate** = all Base fields except vehicle_id, all optional
**FlexfuelConversionResponse** = Base + `id`, `vehicle_id`, `created_at`, `updated_at`

#### E10 Reference Price
**Base**: `reference_date`, `price_per_liter` (>0, <=10), `notes`
**Create** = Base | **Update** = all optional | **Response** = Base + `id`, `created_at`, `updated_at`

#### Rentability
| Schema | Fields |
|--------|--------|
| FlexfuelSavingsDataPoint | `date`, `e85_liters`, `e85_cost`, `equivalent_e10_liters`, `e10_reference_price`, `e10_equivalent_cost`, `savings`, `cumulative_savings` |
| FlexfuelMonthlySavings | `month: "YYYY-MM"`, `savings: float` |
| FlexfuelRentabilitySummary | `vehicle_id`, `kit_cost`, `overconsumption_pct`, `conversion_date`, `total_e85_fills`, `total_savings`, `break_even_reached`, `break_even_date`, `monthly_average_savings`, `skipped_fills_no_e10_price`, `data_points`, `monthly_savings` |

---

## Service Methods

### VehicleService (`services/vehicle_service.py`)

| Method | Returns | Purpose |
|--------|---------|---------|
| `get_vehicles(skip, limit, active_only, fuel_type)` | List[Vehicle] | List with filtering |
| `get_vehicle(vehicle_id)` | Vehicle\|None | Single vehicle by ID |
| `get_vehicle_by_license_plate(license_plate)` | Vehicle\|None | Lookup by plate |
| `create_vehicle(data: VehicleCreate)` | Vehicle | Create |
| `update_vehicle(vehicle_id, data: VehicleUpdate)` | Vehicle | Update (raises ValueError on not found) |
| `delete_vehicle(vehicle_id, force=False)` | bool | Soft-delete (or hard with force=True) |
| `archive_vehicle(vehicle_id)` | Vehicle\|None | Sets is_active=False |
| `get_vehicle_timeline(vehicle_id)` | VehicleTimeline | Merged fuel + maintenance sorted desc |
| `get_vehicle_stats(vehicle_id)` | VehicleStats | Full stats (delegates fuel to FuelService, adds insurance + seasonal) |
| `_calculate_current_insurance_limit(vehicle)` | float\|None | Compute rolling insurance km limit |
| `_compute_seasonal_consumption(vehicle_id, opc, tank)` | dict[str,SeasonStats] | Per-season consumption with E85/E10 normalization |

### FuelService (`services/fuel_service.py`)

| Method | Returns | Purpose |
|--------|---------|---------|
| `_assert_vehicle_exists(vehicle_id)` | None | Raises ValueError if missing |
| `create_fuel_entry(data: FuelEntryCreate)` | FuelEntry | Create (auto-calculates total_cost) |
| `get_fuel_entry(entry_id)` | FuelEntry\|None | Single entry (active only) |
| `get_fuel_entries(vehicle_id?, fuel_type?, dates?, skip, limit, order_by, order)` | List[FuelEntry] | Filtered, paginated list |
| `get_fuel_entries_by_vehicle(vehicle_id, skip, limit)` | List[FuelEntry] | All entries for vehicle |
| `update_fuel_entry(entry_id, update)` | FuelEntry\|None | Update (recalculates total_cost) |
| `delete_fuel_entry(entry_id)` | bool | Soft-delete (is_active=False) |
| `get_distinct_station_names(vehicle_id?)` | List[str] | Distinct station names for autocomplete |
| `get_nearest_station(vehicle_id, lat, lon, radius_m)` | dict\|None | Closest known station via haversine |
| `get_latest_fuel_entry_by_vehicle(vehicle_id)` | FuelEntry\|None | Most recent entry |
| `get_fuel_entries_count(...)` | int | Count with filters |
| `get_fuel_statistics_by_vehicle(vehicle_id)` | dict | Aggregated stats (partial-fill-aware avg) |
| `get_consumption_history(vehicle_id)` | dict | Data points for charts (partial-fill-aware) |

### MaintenanceService (`services/maintenance_service.py`)

| Method | Returns | Purpose |
|--------|---------|---------|
| `_assert_vehicle_exists(vehicle_id)` | None | Raises ValueError |
| `create_maintenance(data)` | Maintenance | Create |
| `get_maintenance(maintenance_id)` | Maintenance\|None | Single (active only) |
| `get_maintenances(...)` | List[Maintenance] | Filtered, paginated list |
| `get_maintenances_by_vehicle(vehicle_id, skip, limit)` | List[Maintenance] | All for vehicle |
| `update_maintenance(maintenance_id, update)` | Maintenance\|None | Update |
| `delete_maintenance(maintenance_id)` | bool | Soft-delete (is_active=False) |
| `get_latest_maintenance_by_vehicle(vehicle_id)` | Maintenance\|None | Most recent by date then odometer |
| `get_maintenances_count(...)` | int | Count with filters |
| `get_maintenance_statistics_by_vehicle(vehicle_id)` | dict | Aggregated stats |

### FlexfuelService (`services/flexfuel_service.py`)

| Method | Returns | Purpose |
|--------|---------|---------|
| `_assert_vehicle_exists(vehicle_id)` | None | Raises ValueError |
| `create_conversion(data)` | FlexfuelConversion | CRUD - create |
| `get_conversion(vehicle_id)` | FlexfuelConversion\|None | CRUD - read (one per vehicle) |
| `update_conversion(vehicle_id, data)` | FlexfuelConversion\|None | CRUD - update |
| `delete_conversion(vehicle_id)` | bool | CRUD - hard delete |
| `create_e10_price(data)` | E10ReferencePrice | CRUD - create |
| `get_e10_prices()` | List[E10ReferencePrice] | CRUD - list all, sorted desc |
| `update_e10_price(price_id, data)` | E10ReferencePrice\|None | CRUD - update |
| `delete_e10_price(price_id)` | bool | CRUD - hard delete |
| `get_latest_e10_price_at_date(target_date)` | float\|None | Closest E10 price on or before date |
| `calculate_rentability(vehicle_id)` | dict\|None | Break-even analysis |

---

## Enums

### FuelType (`core/enums.py`)

| Value | DB Stored As | Description |
|-------|-------------|-------------|
| `GASOLINE` | `"essence"` | Regular gasoline |
| `DIESEL` | `"diesel"` | Diesel |
| `ELECTRIC` | `"electrique"` | Electric |
| `HYBRID` | `"hybride"` | Hybrid |
| `LPG` | `"gpl"` | LPG |
| `E85` | `"e85"` | Superethanol E85 |

### OrderBy enums (in endpoint files)

**FuelEntryOrderBy** (`fuel_entries.py`): `fueling_date`, `created_at`, `odometer_reading`, `total_cost`, `liters`, `price_per_liter`

**MaintenanceOrderBy** (`maintenances.py`): `maintenance_date`, `created_at`, `odometer_reading`, `cost`, `next_maintenance_date`

---

## Utilities

### `utils/calculations.py`
- `haversine_m(lat1, lon1, lat2, lon2)` → float: distance in meters
- `calculate_fuel_consumption(distance_km, fuel_liters)` → float: L/100km
- `calculate_cost_per_km(total_cost, distance_km)` → float: EUR/km

---

## Key Formulas

### Consumption (fill-to-fill method)
```
For each full-tank entry (except first):
  accumulated_liters = sum of liters from previous full-tank (including partials)
  distance = current_odometer - previous_full_tank_odometer
  consumption = (accumulated_liters * 100) / distance
```

### Vehicle Range
```
usable_liters = tank_capacity - 5  (5L cushion = warning-light reserve)
range_km = usable_liters * 100 / consumption_L100km
```

### Seasonal normalisation (E85/E10)
```
For each fill-to-fill segment i:
  e85_fraction_i = e85_liters_i / total_liters_i
  e10_l100_i = measured_l100_i / (1 + opc * e85_fraction_i)
  e85_l100_i = e10_l100_i * (1 + opc)
Season average = mean of all segment e10/e85 values
```

### E85 Rentability
```
equivalent_e10_liters = e85_liters / (1 + overconsumption_pct / 100)
e10_equivalent_cost = equivalent_e10_liters * latest_e10_ref_price_at_date
savings_per_fill = e10_equivalent_cost - actual_e85_cost
```

### Blend Calculator (ethanol % in tank)
```
ethanol_fraction_in_tank = ethanol_liters / remaining_liters
Dilutant needed: x = (target * (remaining + T) - ethanol_liters - 0.85 * T) / (dilutant_fraction - 0.85)
E85 to add: y = tank_capacity - remaining - x
Minimum pump constraint (France): x >= 5L (rounds to 5 if x_ideal < 5)
```

### Insurance KM
```
current_limit = insurance_km_limit + floor(years_since_start_date) * annual_increase
remaining = current_limit - last_odometer_reading
```

### Cost of Ownership
```
total_cost = purchase_price + total_fuel_cost + total_maintenance_cost
cost_per_month = (fuel_cost + maintenance_cost) / months_owned
all_in_cost_per_km = total_cost / total_distance
projected_yearly = cost_per_month * 12
```

---

## Frontend Component Map

### Charts (`components/charts/`) — 9 files
| Component | Chart Type | Purpose |
|-----------|-----------|---------|
| ConsumptionChart | Recharts LineChart | L/100km per fill, avg reference line, full-tank markers |
| PriceChart | Recharts LineChart | EUR/L per fill, station name labels |
| MonthlyCostChart | Recharts BarChart + LineChart | Stacked fuel/maintenance per month, projected annual |
| DistanceChart | Recharts BarChart + LineChart | Monthly km, running total, avg line, projected annual badge |
| OdometerChart | Recharts LineChart | Odometer progression, insurance limit, warnings, remaining gauge |
| StationsMap | Leaflet (ui/map.tsx) | Map of GPS fill locations, clustered 100m radius |
| FlexfuelRentabilityChart | Recharts LineChart + BarChart | Cumulative savings, monthly bars, break-even marker |
| EthanolHistoryChart | Recharts LineChart | Ethanol % per full fill, target band, E10-equivalent area |
| InsuranceKmChart | Recharts LineChart | Odometer vs insurance limit, projection, exceeded zone |

### Dialogs — 15 files
| Dialog | File |
|--------|------|
| VehicleAddDialog | `vehicles/VehicleAddDialog.tsx` |
| VehicleEditDialog | `vehicles/VehicleEditDialog.tsx` |
| VehicleDetailsDialog | `vehicles/VehicleDetailsDialog.tsx` |
| VehicleTimelineSheet | `vehicles/VehicleTimelineSheet.tsx` |
| FuelAddDialog | `fuel/FuelAddDialog.tsx` |
| FuelEditDialog | `fuel/FuelEditDialog.tsx` |
| FuelViewDialog | `fuel/FuelViewDialog.tsx` |
| FuelCharts | `fuel/FuelCharts.tsx` |
| StationPricesDialog | `fuel/StationPricesDialog.tsx` |
| NearbyStationsList | `fuel/NearbyStationsList.tsx` |
| MaintenanceAddDialog | `maintenance/MaintenanceAddDialog.tsx` |
| MaintenanceEditDialog | `maintenance/MaintenanceEditDialog.tsx` |
| MaintenanceViewDialog | `maintenance/MaintenanceViewDialog.tsx` |
| BlendCalculatorDialog | `flexfuel/BlendCalculatorDialog.tsx` |
| FlexfuelConversionDialog | `flexfuel/FlexfuelConversionDialog.tsx` |
| E10ReferencePriceDialog | `flexfuel/E10ReferencePriceDialog.tsx` |

### Hooks (`hooks/`) — 8 files
| File | Hooks |
|------|-------|
| `use-vehicles.ts` | useVehicles, useVehicle, useAllVehicleStats, useVehicleStats, useVehicleCostStats, CRUD hooks |
| `use-fuel-entries.ts` | useFuelEntries, useAllFuelEntries, useLatestFuelEntry, useFuelStats, useConsumptionHistory, useNearestStation, useStationSuggestions, useGlobalStationHistory, CRUD hooks |
| `use-maintenances.ts` | useMaintenances, useMaintenanceStats, CRUD hooks |
| `use-maintenance-reminders.ts` | useMaintenanceReminders |
| `use-flexfuel.ts` | useFlexfuelConversion, useE10ReferencePrices, useFlexfuelRentability, CRUD hooks |
| `use-geolocation.ts` | useGeolocation |
| `use-nearby-stations.ts` | useNearbyStations (gouv.fr API) |
| `use-offline.ts` | useOffline (localStorage queue + sync) |

### TypeScript Types (`types/index.ts`) — 30 interfaces
**Vehicle (7):** Vehicle, VehicleList, VehicleCreate, VehicleUpdate, SeasonStats, VehicleStats, VehicleCostStats
**Fuel (7):** FuelEntry, FuelEntryCreate, FuelEntryUpdate, FuelEntryListResponse, FuelStatistics, ConsumptionDataPoint, ConsumptionHistory
**Maintenance (4):** Maintenance, MaintenanceCreate, MaintenanceUpdate, MaintenanceStatistics
**FlexFuel (6):** FlexfuelConversion, FlexfuelConversionCreate, FlexfuelConversionUpdate, E10ReferencePrice, E10ReferencePriceCreate, FlexfuelSavingsDataPoint, FlexfuelMonthlySavings, FlexfuelRentabilitySummary
**Timeline (2):** VehicleTimelineEvent, VehicleTimeline

---

## Architecture Patterns

1. **Service layer**: endpoints never touch DB directly — always go through service classes
2. **Dependency injection**: `db: Session = Depends(get_db)` on all endpoints
3. **Soft delete**: vehicles/fuel/maintenance use `is_active=False` | FlexFuel/E10 use hard delete (inconsistent)
4. **Auth**: optional `X-API-Key` header, applied as router-level dependency, bypassed on `/health` and `/docs`
5. **order_by whitelist**: strict `str(Enum)` classes (FuelEntryOrderBy, MaintenanceOrderBy) — no raw strings
6. **Opaque error responses**: static French strings, internal details go to `logger.exception()` only
7. **Pydantic v2**: `@field_validator` + `@classmethod`, `model_dump` available but `.dict(exclude_unset=True)` still used
8. **Batch stats**: `GET /vehicles/stats/batch` returns dict keyed by vehicle_id to avoid N+1 on dashboard
9. **Partial fill accumulation**: liters accumulate across non-full entries until the next full tank triggers a consumption data point

---

## Known Gotchas

- **SQLAlchemy Enum storage**: Python enum member **names** stored in DB (uppercase), not values. DB ENUM must use uppercase.
- **`.dict(exclude_unset=True)`**: Pydantic v1-style, works in v2 but generates deprecation warnings
- **`Vehicle.fuel_type` stored as plain `String`**: inconsistent with `FuelEntry.fuel_type` which uses `SQLEnum`
- **No odometer monotonicity**: decreasing odometer entries silently corrupt consumption
- **VehicleStats dict merge**: `get_vehicle_stats()` merges untyped dict from `FuelService` — fragile
- **`prix-carburant` API**: no `name` field (use `adresse`), prices are doubles not milliemes, geo is `geom` proto
- **Zod schemas**: must update ALL Zod schemas when adding fuel types — easy to miss one
- **TSC strict**: `bun run build` runs `tsc -b && vite build`, unused imports are errors
