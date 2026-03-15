# Production Deployment Guide

This guide explains how to deploy VroomVroom to your production server with a remote MariaDB database.

## Overview

- **Frontend**: https://carmanagement.home.ouiouibaguette.fr
- **Backend API**: https://carmanagementapi.home.ouiouibaguette.fr
- **Database**: Remote MariaDB at 192.168.25.46:3306

## Prerequisites

On your server:
- Docker and Docker Compose installed
- Access to remote MariaDB database (192.168.25.46)
- Ports 3055 and 8055 available (or configure your reverse proxy)

## Deployment Options

### Option 1: Using Production Docker Compose (Recommended)

This uses `docker-compose.prod.yml` which excludes the local MariaDB container.

#### Step 1: Copy Files to Server

```bash
# From your laptop, sync the project to your server
rsync -avz --exclude 'node_modules' --exclude '.git' \
  /home/supermut59000/Work/VroomVroom/ \
  user@your-server:/path/to/vroomvroom/

# Or use git
cd /path/to/vroomvroom/
git pull
```

#### Step 2: Verify Database Connection

Ensure the remote database is accessible from your server:

```bash
# Test connection from server
mysql -h 192.168.25.46 -P 3306 -u mathis -pmathis vehicle_management -e "SELECT 1;"
```

#### Step 3: Apply Database Migrations

If this is the first deployment, apply the insurance tracking migration:

```bash
mysql -h 192.168.25.46 -P 3306 -u mathis -pmathis vehicle_management < \
  backend/migrations/add_insurance_km_tracking.sql
```

#### Step 4: Start Services

```bash
# Start using production compose file
docker-compose -f docker-compose.prod.yml up -d --build

# Check logs
docker-compose -f docker-compose.prod.yml logs -f

# Verify services are running
docker-compose -f docker-compose.prod.yml ps
```

### Option 2: Using Default Docker Compose

If you want to use the default `docker-compose.yml` without the local database:

```bash
# Start only backend and frontend (skip mariadb service)
docker-compose up -d --build backend frontend

# Or temporarily comment out the mariadb service in docker-compose.yml
```

## Configuration Files

### Backend Environment (.env)

Located at: `backend/.env`

```bash
# Database Configuration (REMOTE)
DB_HOST=192.168.25.46
DB_PORT=3306
DB_USER=mathis
DB_PASSWORD=mathis
DB_NAME=vehicle_management

# Environment
DEBUG=False
ENVIRONMENT=production
LOG_LEVEL=INFO

# CORS
BACKEND_CORS_ORIGINS=https://carmanagement.home.ouiouibaguette.fr,https://carmanagementapi.home.ouiouibaguette.fr,*
```

**Important:** Make sure to use `.env` (not `.env.local`) in production!

### Frontend Configuration

The frontend automatically detects the environment:

- **Localhost**: Uses `http://localhost:8055/api/v1`
- **Production**: Uses `https://carmanagementapi.home.ouiouibaguette.fr/api/v1`

This is handled by `frontend/js/config.js`.

## Reverse Proxy Configuration (Nginx/Traefik)

You'll need to configure your reverse proxy to route traffic:

### Nginx Example

```nginx
# Frontend
server {
    listen 443 ssl;
    server_name carmanagement.home.ouiouibaguette.fr;

    ssl_certificate /path/to/cert.pem;
    ssl_certificate_key /path/to/key.pem;

    location / {
        proxy_pass http://localhost:3055;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}

# Backend API
server {
    listen 443 ssl;
    server_name carmanagementapi.home.ouiouibaguette.fr;

    ssl_certificate /path/to/cert.pem;
    ssl_certificate_key /path/to/key.pem;

    location / {
        proxy_pass http://localhost:8055;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

## Useful Commands

### View Logs

```bash
# Production compose
docker-compose -f docker-compose.prod.yml logs -f

# Specific service
docker-compose -f docker-compose.prod.yml logs -f backend
docker-compose -f docker-compose.prod.yml logs -f frontend
```

### Restart Services

```bash
# Restart all
docker-compose -f docker-compose.prod.yml restart

# Restart specific service
docker-compose -f docker-compose.prod.yml restart backend
```

### Update Application

```bash
# Pull latest changes
git pull

# Rebuild and restart
docker-compose -f docker-compose.prod.yml up -d --build

# Or without cache
docker-compose -f docker-compose.prod.yml build --no-cache
docker-compose -f docker-compose.prod.yml up -d
```

### Stop Services

```bash
docker-compose -f docker-compose.prod.yml down
```

## Database Management

### Connect to Remote Database

```bash
# From your server
mysql -h 192.168.25.46 -P 3306 -u mathis -pmathis vehicle_management
```

### Backup Database

```bash
# Create backup
mysqldump -h 192.168.25.46 -u mathis -pmathis vehicle_management > \
  backup_$(date +%Y%m%d_%H%M%S).sql

# Restore backup
mysql -h 192.168.25.46 -u mathis -pmathis vehicle_management < backup_20251209_143000.sql
```

### Apply New Migrations

```bash
# Apply insurance tracking migration
mysql -h 192.168.25.46 -u mathis -pmathis vehicle_management < \
  backend/migrations/add_insurance_km_tracking.sql

# Or connect and run manually
mysql -h 192.168.25.46 -u mathis -pmathis vehicle_management
SOURCE /path/to/migration.sql;
```

## Troubleshooting

### Backend Can't Connect to Database

1. Check database accessibility:
```bash
mysql -h 192.168.25.46 -P 3306 -u mathis -pmathis -e "SELECT 1;"
```

2. Check firewall rules on database server (192.168.25.46)

3. Verify `.env` file has correct credentials

4. Check backend logs:
```bash
docker-compose -f docker-compose.prod.yml logs backend
```

### CORS Errors

1. Verify CORS settings in `backend/.env`:
```bash
BACKEND_CORS_ORIGINS=https://carmanagement.home.ouiouibaguette.fr,https://carmanagementapi.home.ouiouibaguette.fr,*
```

2. Restart backend after changing `.env`:
```bash
docker-compose -f docker-compose.prod.yml restart backend
```

### Frontend Can't Reach Backend

1. Check `frontend/js/config.js` detects correct environment

2. Verify reverse proxy is routing correctly:
```bash
curl https://carmanagementapi.home.ouiouibaguette.fr/api/v1/vehicles/
```

3. Check browser console for errors

### Port Conflicts

If ports 3055 or 8055 are in use:

1. Edit `docker-compose.prod.yml` and change ports:
```yaml
ports:
  - "8056:8000"  # Change 8055 to 8056
```

2. Update your reverse proxy configuration

## Security Recommendations

1. **Change Default Password**:
```bash
# In backend/.env
DB_PASSWORD=your-strong-password-here
```

2. **Restrict CORS**:
Remove the `*` wildcard once you've confirmed your production URLs work:
```bash
BACKEND_CORS_ORIGINS=https://carmanagement.home.ouiouibaguette.fr,https://carmanagementapi.home.ouiouibaguette.fr
```

3. **Enable HTTPS**:
Ensure your reverse proxy handles SSL/TLS termination with valid certificates (Let's Encrypt)

4. **Database Security**:
- Use a strong password for the database user
- Restrict database access by IP (only allow your server's IP)
- Consider using a VPN or SSH tunnel for database access

## Health Checks

### Check if Services are Running

```bash
# Docker containers
docker ps

# Check backend health
curl http://localhost:8055/docs

# Check frontend
curl http://localhost:3055

# Check production URLs
curl https://carmanagementapi.home.ouiouibaguette.fr/docs
curl https://carmanagement.home.ouiouibaguette.fr
```

### Monitor Logs

```bash
# Follow all logs
docker-compose -f docker-compose.prod.yml logs -f

# Follow only errors
docker-compose -f docker-compose.prod.yml logs -f | grep -i error
```

## Scaling (Optional)

If you need to run multiple backend instances:

```bash
# Scale backend to 3 instances
docker-compose -f docker-compose.prod.yml up -d --scale backend=3

# Then configure your reverse proxy for load balancing
```

## Automated Deployment with Git Hooks (Optional)

Create a post-receive hook on your server:

```bash
#!/bin/bash
cd /path/to/vroomvroom
git pull
docker-compose -f docker-compose.prod.yml up -d --build
```

## Quick Reference

| Task | Command |
|------|---------|
| Deploy | `docker-compose -f docker-compose.prod.yml up -d --build` |
| View logs | `docker-compose -f docker-compose.prod.yml logs -f` |
| Restart | `docker-compose -f docker-compose.prod.yml restart` |
| Stop | `docker-compose -f docker-compose.prod.yml down` |
| Update | `git pull && docker-compose -f docker-compose.prod.yml up -d --build` |
| Database backup | `mysqldump -h 192.168.25.46 -u mathis -p vehicle_management > backup.sql` |

## Support

- Main documentation: [CLAUDE.md](CLAUDE.md)
- Local development: [LOCAL_SETUP.md](LOCAL_SETUP.md)
- API documentation: https://carmanagementapi.home.ouiouibaguette.fr/docs
