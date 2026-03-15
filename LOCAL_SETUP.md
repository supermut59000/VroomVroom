# Local Development Setup with MariaDB

This guide explains how to run VroomVroom locally with a containerized MariaDB database.

## Quick Start

```bash
# Start all services (MariaDB + Backend + Frontend)
docker-compose up -d

# View logs
docker-compose logs -f

# Stop all services
docker-compose down

# Stop and remove volumes (clean database)
docker-compose down -v
```

## What's Included

The `docker-compose.yml` now includes:

1. **MariaDB 11.2** - Local database container
   - Port: `3306`
   - User: `mathis`
   - Password: `mathis`
   - Database: `vehicle_management`
   - Root password: `rootpassword`

2. **Backend (FastAPI)** - API service
   - Port: `8055` (maps to container port `8000`)
   - Connects to local MariaDB

3. **Frontend (Nginx)** - Static file server
   - Port: `3055` (maps to container port `3000`)

## Database Initialization

The database schema is automatically created when you first start the services:

- **Location**: `backend/migrations/init_database.sql`
- **Tables created**:
  - `vehicles` (with insurance tracking fields)
  - `fuel_entries`
  - `maintenances`

The initialization script runs automatically via Docker's `docker-entrypoint-initdb.d` mechanism.

## Environment Configuration

Two environment files are provided:

### `.env` (Production/Remote Database)
```bash
DB_HOST=192.168.25.46  # Remote database server
DB_USER=mathis
DB_PASSWORD=mathis
```

### `.env.local` (Local Development)
```bash
DB_HOST=mariadb  # Docker service name
DB_USER=mathis
DB_PASSWORD=mathis
DEBUG=True
```

The `docker-compose.yml` automatically uses `.env.local` when running locally.

## First Time Setup

```bash
# 1. Start all services
docker-compose up -d

# 2. Wait for MariaDB to be healthy (10-30 seconds)
docker-compose logs mariadb

# You should see: "Database initialization completed successfully"

# 3. Check backend logs
docker-compose logs backend

# 4. Access the application
open http://localhost:3055          # Frontend
open http://localhost:8055/docs     # API Documentation (Swagger)
```

## Accessing the Database

### From your laptop (outside Docker):
```bash
mysql -h localhost -P 3306 -u mathis -p vehicle_management
# Password: mathis
```

### From inside a container:
```bash
docker exec -it vroomvroom-mariadb mysql -u mathis -p vehicle_management
```

### Using a GUI tool:
- **Host**: `localhost`
- **Port**: `3306`
- **User**: `mathis`
- **Password**: `mathis`
- **Database**: `vehicle_management`

Tools: DBeaver, MySQL Workbench, phpMyAdmin, etc.

## Apply New Migrations

If you need to apply the insurance tracking migration manually:

```bash
# Connect to database
docker exec -i vroomvroom-mariadb mysql -u mathis -pmathis vehicle_management \
  < backend/migrations/add_insurance_km_tracking.sql
```

Or interactively:
```bash
docker exec -it vroomvroom-mariadb mysql -u mathis -pmathis vehicle_management

# Then run:
SOURCE /docker-entrypoint-initdb.d/add_insurance_km_tracking.sql;
```

## Useful Commands

### View all running containers:
```bash
docker-compose ps
```

### Restart a specific service:
```bash
docker-compose restart backend
docker-compose restart mariadb
```

### View logs for a specific service:
```bash
docker-compose logs -f backend
docker-compose logs -f mariadb
```

### Rebuild after code changes:
```bash
docker-compose up -d --build
```

### Reset the database (WARNING: Deletes all data):
```bash
docker-compose down -v
docker-compose up -d
```

### Access MariaDB shell:
```bash
docker exec -it vroomvroom-mariadb mysql -u mathis -pmathis vehicle_management
```

### Export database:
```bash
docker exec vroomvroom-mariadb mysqldump -u mathis -pmathis vehicle_management \
  > backup_$(date +%Y%m%d_%H%M%S).sql
```

### Import database:
```bash
docker exec -i vroomvroom-mariadb mysql -u mathis -pmathis vehicle_management \
  < backup_20251209_143000.sql
```

## Troubleshooting

### Backend can't connect to database
```bash
# Check if MariaDB is healthy
docker-compose ps

# Check MariaDB logs
docker-compose logs mariadb

# Restart backend (it will retry connection)
docker-compose restart backend
```

### Port 3306 already in use
If you have another MySQL/MariaDB running locally:
```bash
# Option 1: Stop your local database
sudo systemctl stop mysql
sudo systemctl stop mariadb

# Option 2: Change the port in docker-compose.yml
# Change: - "3307:3306"  # Use 3307 on host instead
```

### Database initialization didn't run
```bash
# Remove the volume and restart
docker-compose down -v
docker-compose up -d

# Check logs
docker-compose logs mariadb | grep "initialization"
```

### Frontend can't reach backend
```bash
# Check frontend config
cat frontend/js/config.js

# Should detect localhost and use: http://localhost:8055/api/v1

# Check CORS in backend/.env.local
# Should include: http://localhost:3055
```

## Switching Between Local and Remote Database

### Use Local Database (default with docker-compose):
```bash
# docker-compose.yml already configured to use .env.local
docker-compose up -d
```

### Use Remote Database:
```bash
# Temporarily edit docker-compose.yml to use .env instead of .env.local
# Or update .env.local with remote database credentials
docker-compose down
docker-compose up -d
```

## Data Persistence

Database data is stored in a Docker volume:
- **Volume name**: `vroomvroom_mariadb-data`
- **Data persists** between container restarts
- **Data is deleted** with `docker-compose down -v`

To inspect the volume:
```bash
docker volume ls
docker volume inspect vroomvroom_mariadb-data
```

## Health Checks

MariaDB has a health check that runs every 10 seconds:
- Backend waits for MariaDB to be healthy before starting
- You can check health status: `docker-compose ps`

## Production Deployment

For production, continue using your remote MariaDB at `192.168.25.46`:

```bash
# Deploy only backend and frontend (no local MariaDB)
docker-compose -f docker-compose.prod.yml up -d

# Or manually specify which services to start
docker-compose up -d backend frontend
```

## Need Help?

Check the main [CLAUDE.md](CLAUDE.md) file for full project documentation.
