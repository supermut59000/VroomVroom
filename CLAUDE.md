# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

VroomVroom is a **vehicle management web application** for tracking vehicles, fuel consumption, mileage, and maintenance in a homelab environment. It's a full-stack application with FastAPI backend and Vanilla JavaScript frontend.

**Tech Stack:**
- Backend: Python 3.11+, FastAPI, SQLAlchemy 2.0, Pydantic 2.x, MariaDB/MySQL
- Frontend: Vanilla JavaScript (ES6 modules), Chart.js, pure CSS
- Infrastructure: Docker Compose, Uvicorn ASGI server

## Quick Start

### Development Commands

```bash
# Start all services (backend + frontend)
docker-compose up -d

# View logs
docker logs vroomvroom-backend -f
docker logs vroomvroom-frontend -f

# Rebuild after code changes
docker-compose up -d --build

# Stop all services
docker-compose down

# Access points
# Frontend: http://localhost:3055
# Backend API: http://localhost:8055
# API Docs: http://localhost:8055/docs (Swagger UI)
```

### Local Development (without Docker)

```bash
# Backend
cd backend
pip install -r requirements.txt
python run.py  # Starts on port 8000

# Frontend (separate terminal)
cd frontend
python3 -m http.server 3000
```

## Architecture Overview

### Backend Structure (`backend/app/`)

```
app/
├── main.py              # FastAPI app, CORS, route registration
├── api/
│   ├── deps.py          # Dependency injection (get_db)
│   └── v1/
│       ├── api.py       # Router aggregation
│       └── endpoints/   # Route handlers
│           ├── vehicles.py
│           ├── fuel_entries.py
│           └── maintenances.py (stub)
├── core/
│   ├── config.py        # Settings (DB URL, CORS, logging)
│   └── database.py      # SQLAlchemy engine and session
├── models/              # SQLAlchemy ORM models
│   ├── vehicle.py
│   ├── fuel_entry.py
│   └── maintenance.py (stub)
├── schemas/             # Pydantic validation schemas
│   ├── vehicle.py
│   ├── fuel_entry.py
│   └── maintenance.py (stub)
├── services/            # Business logic layer
│   ├── vehicle_service.py
│   ├── fuel_service.py
│   └── maintenance_service.py (stub)
└── utils/
    ├── calculations.py  # Consumption calculations
    └── logger.py        # Logging configuration
```

### Frontend Structure (`frontend/`)

```
frontend/
├── index.html           # Single-page application entry
├── js/
│   ├── Dashboard.js     # Main orchestrator
│   ├── config.js        # API URL configuration
│   ├── Vehicles/
│   │   ├── VehicleCard.js     # Grid display
│   │   ├── VehicleAdd.js      # Create popup
│   │   ├── VehicleDetails.js  # View popup
│   │   └── VehicleModif.js    # Edit popup
│   └── Fuel/
│       ├── FuelAdd.js         # Create fuel entry
│       ├── FuelView.js        # List/manage entries
│       └── FuelChart.js       # Consumption chart
└── css/
    ├── style.css
    └── StylePopUp.css
```

## Database Schema

### Vehicles Table
```sql
CREATE TABLE vehicles (
    id INT PRIMARY KEY AUTO_INCREMENT,
    brand VARCHAR(50) NOT NULL,             -- indexed
    model VARCHAR(50) NOT NULL,
    year INT NOT NULL,
    license_plate VARCHAR(20) UNIQUE NOT NULL,  -- indexed
    initial_odometer FLOAT NOT NULL,
    tank_capacity FLOAT,
    fuel_type ENUM('essence','diesel','electrique','hybride','gpl'),
    acquisition_date DATE,
    purchase_price FLOAT,
    description TEXT,
    is_active BOOLEAN DEFAULT TRUE,
    created_at DATETIME DEFAULT NOW(),
    updated_at DATETIME DEFAULT NOW() ON UPDATE NOW()
);
```

### Fuel Entries Table
```sql
CREATE TABLE fuel_entries (
    id INT PRIMARY KEY AUTO_INCREMENT,
    vehicle_id INT NOT NULL,                -- FK, indexed
    fuel_type ENUM('essence','diesel','electrique','hybride','gpl'),
    liters FLOAT NOT NULL,
    price_per_liter FLOAT NOT NULL,
    total_cost FLOAT NOT NULL,              -- calculated: liters × price_per_liter
    odometer_reading INT NOT NULL,
    station_name VARCHAR(100),
    location VARCHAR(100),
    fueling_date DATE NOT NULL,
    notes TEXT,
    created_at DATETIME DEFAULT NOW(),
    updated_at DATETIME DEFAULT NOW() ON UPDATE NOW(),
    FOREIGN KEY (vehicle_id) REFERENCES vehicles(id)
);
```

**Note:** Maintenance table is stubbed but not implemented.

## API Endpoints

**Base URL:**
- Local: `http://localhost:8055/api/v1`
- Production: `https://carmanagementapi.home.ouiouibaguette.fr/api/v1`

### Vehicles (`/api/v1/vehicles`)

| Method | Endpoint | Purpose |
|--------|----------|---------|
| GET | `/` | List vehicles (with filters: active_only, fuel_type) |
| POST | `/` | Create vehicle |
| GET | `/{vehicle_id}` | Get vehicle details |
| PUT | `/{vehicle_id}` | Update vehicle |
| DELETE | `/{vehicle_id}` | Soft delete (or force delete with `?force=true`) |
| GET | `/{vehicle_id}/stats` | Get statistics (consumption, costs, distance) |
| POST | `/{vehicle_id}/archive` | Archive vehicle (set is_active=False) |

### Fuel Entries (`/api/v1/fuel-entries`)

| Method | Endpoint | Purpose |
|--------|----------|---------|
| POST | `/` | Create fuel entry |
| GET | `/` | List entries (filters: vehicle_id, fuel_type, date range, pagination) |
| GET | `/{entry_id}` | Get specific entry |
| PUT | `/{entry_id}` | Update entry |
| DELETE | `/{entry_id}` | Delete entry |
| GET | `/vehicle/{vehicle_id}` | Get all entries for vehicle |
| GET | `/vehicle/{vehicle_id}/latest` | Get most recent entry |
| GET | `/vehicle/{vehicle_id}/statistics` | Get fuel statistics |
| GET | `/vehicle/{vehicle_id}/consumption-history` | Get consumption over time (for charts) |

## Key Implementation Patterns

### Backend Patterns

**1. Service Layer Pattern**
```python
# Endpoints use services, not direct DB access
from app.services.vehicle_service import VehicleService

@router.get("/{vehicle_id}")
def get_vehicle(vehicle_id: int, db: Session = Depends(get_db)):
    service = VehicleService(db)
    vehicle = service.get_vehicle(vehicle_id)
    if not vehicle:
        raise HTTPException(status_code=404, detail="Vehicle not found")
    return vehicle
```

**2. Dependency Injection for Database**
```python
# All endpoints use: db: Session = Depends(get_db)
def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
```

**3. Pydantic Validation with Custom Validators**
```python
class VehicleBase(BaseModel):
    license_plate: str

    @field_validator('license_plate')
    def uppercase_license_plate(cls, v):
        return v.upper() if v else v
```

**4. Soft Delete Pattern**
```python
# Vehicles use is_active flag
vehicle.is_active = False  # Archive
# Force delete with: ?force=true query parameter
```

**5. Automatic Calculation Fields**
```python
# FuelEntry total_cost calculated automatically
def create_fuel_entry(self, fuel_entry_data: FuelEntryCreate):
    fuel_entry_data.total_cost = fuel_entry_data.liters * fuel_entry_data.price_per_liter
```

### Frontend Patterns

**1. Module-Based Architecture**
```javascript
// Each feature is an ES6 class
export default class VehicleCard {
    constructor(dashboard) {
        this.dashboard = dashboard;
        this.API_URL = API_URL;
    }
}
```

**2. Environment Detection**
```javascript
// config.js automatically detects environment
const hostname = window.location.hostname;
export const API_URL = hostname === 'localhost'
    ? 'http://localhost:8055/api/v1'
    : 'https://carmanagementapi.home.ouiouibaguette.fr/api/v1';
```

**3. Popup/Modal Pattern**
```javascript
// All forms use overlay-based popups
showPopup() {
    this.overlay.style.display = 'flex';
    this.overlay.addEventListener('click', this.handleOverlayClick);
    document.addEventListener('keydown', this.handleEscapeKey);
}
```

**4. Event Delegation in Dashboard**
```javascript
// Central event handling from Dashboard.js
renderVehicles() {
    // Renders all vehicles
    // Dashboard handles button clicks via data-vehicle-id
}
```

## Important Calculations

### Fuel Consumption (L/100km)

**Location:** [backend/app/services/fuel_service.py:get_consumption_history()](backend/app/services/fuel_service.py)

```python
# Formula: (liters × 100) / distance_traveled_km
#
# For each fuel entry (except the first):
# - distance = current_odometer - previous_odometer
# - consumption = (current_liters × 100) / distance
#
# First entry has no consumption (no previous reference point)
```

### Vehicle Statistics

**Location:** [backend/app/services/vehicle_service.py:get_vehicle_stats()](backend/app/services/vehicle_service.py)

```python
# Total distance = last_odometer - (initial_odometer OR first_entry_odometer)
# Average consumption = (total_fuel_liters / total_distance_km) × 100
# Cost per km = total_fuel_cost / total_distance_km
# Average price = sum(all prices) / number_of_entries
```

## Configuration Files

### Environment Variables (`backend/.env`)
```bash
# Database
DB_HOST=192.168.25.9
DB_PORT=3306
DB_USER=vehicleadmin
DB_PASSWORD=***
DB_NAME=vehicle_management

# API
API_HOST=0.0.0.0
API_PORT=8000
DEBUG=False

# CORS (comma-separated)
CORS_ORIGINS=http://localhost:3055,https://carmanagement.home.ouiouibaguette.fr
```

### Docker Compose Ports
- Frontend: 3055 → 3000 (container)
- Backend: 8055 → 8000 (container)

### Python Dependencies (`requirements.txt`)
```
fastapi==0.109.0
uvicorn[standard]==0.27.0
sqlalchemy==2.0.25
pydantic==2.5.3
pydantic-settings==2.1.0
pymysql==1.1.0
python-dotenv==1.0.0
```

## Development Guidelines

### When Adding New Features

1. **Database Model** → Create in `models/`
2. **Pydantic Schemas** → Create in `schemas/` (Base, Create, Update, Response)
3. **Service Layer** → Implement business logic in `services/`
4. **API Endpoints** → Add routes in `api/v1/endpoints/`
5. **Register Router** → Add to `api/v1/api.py`
6. **Frontend Module** → Create class in `js/`
7. **Update Dashboard** → Integrate in `Dashboard.js`

### Code Style

**Backend:**
- Use type hints: `def get_vehicle(vehicle_id: int) -> Vehicle:`
- Service classes with `__init__(self, db: Session)`
- Pydantic schemas for all API contracts
- Raise HTTPException for errors (404, 400, 422)

**Frontend:**
- ES6 classes for modules
- Arrow functions for event handlers
- Async/await for API calls
- No jQuery or frameworks - pure JavaScript

### Testing (Not Yet Implemented)

When adding tests:
```bash
# Install test dependencies
pip install pytest pytest-asyncio httpx

# Run tests
pytest backend/tests/

# Structure:
# backend/tests/
#   ├── test_vehicles.py
#   ├── test_fuel_entries.py
#   └── conftest.py  # fixtures
```

## Current Feature Status

### Implemented ✅
- Vehicle CRUD with soft delete
- Fuel entry CRUD
- Statistics calculation (consumption, costs)
- Consumption history charting
- Vehicle archiving
- Pagination and filtering
- Environment-based configuration

### Partially Implemented 🟡
- Maintenance tracking (models exist, no functionality)

### Not Implemented ❌
- Authentication/authorization
- Multi-user support
- Photo upload for receipts
- Maintenance reminders
- CSV/PDF export
- Unit/integration tests
- CI/CD pipeline

## Common Tasks

### Add a New API Endpoint

```bash
# 1. Update model (if needed)
# backend/app/models/vehicle.py

# 2. Add schema
# backend/app/schemas/vehicle.py

# 3. Add service method
# backend/app/services/vehicle_service.py
def new_method(self, param):
    # business logic
    return result

# 4. Add endpoint
# backend/app/api/v1/endpoints/vehicles.py
@router.post("/new-endpoint")
def new_endpoint(data: Schema, db: Session = Depends(get_db)):
    service = VehicleService(db)
    return service.new_method(data)
```

### Add a Frontend Feature

```bash
# 1. Create module class
# frontend/js/NewFeature/NewFeature.js
export default class NewFeature {
    constructor(dashboard) {
        this.dashboard = dashboard;
        this.API_URL = API_URL;
    }

    async loadData() {
        const response = await fetch(`${this.API_URL}/endpoint`);
        const data = await response.json();
        // render data
    }
}

# 2. Import in Dashboard.js
import NewFeature from './NewFeature/NewFeature.js';

# 3. Initialize in Dashboard constructor
this.newFeature = new NewFeature(this);

# 4. Add to Dashboard methods
loadNewFeature() {
    this.newFeature.loadData();
}
```

### Debug Database Issues

```bash
# Connect to MariaDB
docker exec -it mariadb mysql -u vehicleadmin -p vehicle_management

# Check tables
SHOW TABLES;
DESCRIBE vehicles;

# View recent entries
SELECT * FROM vehicles ORDER BY created_at DESC LIMIT 5;
SELECT * FROM fuel_entries ORDER BY fueling_date DESC LIMIT 10;

# Check foreign keys
SELECT * FROM information_schema.KEY_COLUMN_USAGE
WHERE TABLE_NAME = 'fuel_entries';
```

## Production Deployment

**URLs:**
- Frontend: https://carmanagement.home.ouiouibaguette.fr
- Backend: https://carmanagementapi.home.ouiouibaguette.fr

**Reverse Proxy:** Likely Nginx or Traefik (not in repo)

**SSL:** Handled by reverse proxy (Let's Encrypt)

**Database:** External MariaDB at 192.168.25.9:3306

See [DEPLOYMENT.md](DEPLOYMENT.md) for full deployment instructions.

## Troubleshooting

### Backend won't start
```bash
# Check logs
docker logs vroomvroom-backend

# Common issues:
# - Database connection: Check .env file, verify DB is running
# - Port conflict: Check if 8055 is available
# - Dependency error: Rebuild image with --no-cache
```

### Frontend can't reach backend
```bash
# Check config.js environment detection
console.log(API_URL);  # In browser console

# Verify CORS settings in backend/.env
# CORS_ORIGINS must include frontend URL

# Check network in docker-compose
docker network inspect vroomvroom_vroomvroom-network
```

### Calculation errors
```bash
# Verify fuel entries have sequential odometer readings
SELECT vehicle_id, odometer_reading, fueling_date
FROM fuel_entries
WHERE vehicle_id = X
ORDER BY odometer_reading;

# Check for gaps or decreasing odometer values
```

## File Reference Quick Links

- Entry point: [backend/app/main.py](backend/app/main.py)
- Configuration: [backend/app/core/config.py](backend/app/core/config.py)
- Vehicle endpoints: [backend/app/api/v1/endpoints/vehicles.py](backend/app/api/v1/endpoints/vehicles.py)
- Fuel endpoints: [backend/app/api/v1/endpoints/fuel_entries.py](backend/app/api/v1/endpoints/fuel_entries.py)
- Frontend entry: [frontend/index.html](frontend/index.html)
- Main dashboard: [frontend/js/Dashboard.js](frontend/js/Dashboard.js)
- Docker config: [docker-compose.yml](docker-compose.yml)
