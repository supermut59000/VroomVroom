# VroomVroom

Personal vehicle management app for tracking fuel, maintenance, and costs. Designed for homelab self-hosting.

## Features

**Vehicles**
- Add, edit, archive, and delete vehicles
- Dashboard with stats per vehicle (consumption, distance, costs)
- Insurance km limit tracking with visual alerts
- Maintenance reminders on vehicle cards (overdue/upcoming badges)

**Fuel Tracking**
- Log fuel entries (full or partial fill)
- Automatic consumption calculation (L/100km) with partial fill accumulation
- Consumption history chart (Recharts)
- Price per liter, station name, location tracking
- CSV export (French formatting, semicolon separator, Excel-compatible)

**Maintenance**
- Log maintenance entries (vidange, pneus, freins, CT, distribution, etc.)
- 10 maintenance types supported
- Cost breakdown by month and year
- Next maintenance reminders by date and km
- CSV export

**General**
- Dark mode toggle (system/light/dark)
- Mobile-friendly PWA (installable, offline-capable)
- Soft delete / archiving for vehicles
- Sorting and filtering on all lists
- API key authentication (backend)

## Tech Stack

| Layer    | Tech                                          |
|----------|-----------------------------------------------|
| Backend  | Python, FastAPI, SQLAlchemy, Pydantic          |
| Frontend | React 19, TypeScript, Tailwind CSS, shadcn/ui  |
| Database | MariaDB                                        |
| Infra    | Docker Compose                                 |
| Tests    | pytest, httpx (SQLite in-memory)               |

## Quick Start

```bash
docker-compose up -d

# Frontend: http://localhost:3055
# Backend API: http://localhost:8055
# Swagger docs: http://localhost:8055/docs
```

## Production

```bash
docker-compose -f docker-compose.prod.yml up -d --build
```

## Tests

```bash
cd backend
pip install pytest httpx
pytest tests/ -v
```

## Documentation

- [PRODUCTION_DEPLOYMENT.md](PRODUCTION_DEPLOYMENT.md) — Production deployment guide
- [LOCAL_SETUP.md](LOCAL_SETUP.md) — Local development setup
- [CLAUDE.md](CLAUDE.md) — Full project reference for AI sessions
- [SUMMARY.md](SUMMARY.md) — Detailed app documentation and session history
