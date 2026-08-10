import logging
from enum import Enum
from typing import List, Optional
from datetime import date
from fastapi import APIRouter, Depends, HTTPException, Query, Path, status
from sqlalchemy.orm import Session

from app.api.deps import get_db
from app.services.maintenance_service import MaintenanceService
from app.schemas.maintenance import (
    MaintenanceCreate,
    MaintenanceUpdate,
    MaintenanceResponse,
    MaintenanceListResponse,
    MaintenanceStatisticsResponse,
)
from app.models.maintenance import Maintenance

logger = logging.getLogger(__name__)

router = APIRouter()


class MaintenanceOrderBy(str, Enum):
    maintenance_date = "maintenance_date"
    created_at = "created_at"
    odometer_reading = "odometer_reading"
    cost = "cost"
    next_maintenance_date = "next_maintenance_date"


@router.post("/", response_model=MaintenanceResponse, status_code=status.HTTP_201_CREATED)
def create_maintenance(
    maintenance: MaintenanceCreate,
    db: Session = Depends(get_db)
):
    """Create a new maintenance entry"""
    maintenance_service = MaintenanceService(db)

    try:
        db_maintenance = maintenance_service.create_maintenance(maintenance)
        return db_maintenance
    except ValueError as e:
        logger.warning("Validation error creating maintenance for vehicle %d: %s", maintenance.vehicle_id, e)
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=str(e))
    except Exception:
        logger.exception("Unexpected error creating maintenance entry")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Erreur lors de la création de l'entrée de maintenance"
        )


@router.get("/", response_model=MaintenanceListResponse)
def get_maintenances(
    vehicle_id: Optional[int] = Query(None, description="Filter by vehicle ID"),
    maintenance_type: Optional[str] = Query(None, description="Filter by maintenance type"),
    start_date: Optional[date] = Query(None, description="Filter by start date"),
    end_date: Optional[date] = Query(None, description="Filter by end date"),
    page: int = Query(1, ge=1, description="Page number"),
    per_page: int = Query(20, ge=1, le=100, description="Items per page"),
    order_by: MaintenanceOrderBy = Query(MaintenanceOrderBy.maintenance_date, description="Order by field"),
    order: str = Query("desc", pattern="^(asc|desc)$", description="Order direction"),
    db: Session = Depends(get_db)
):
    """Get maintenance entries with optional filters and pagination"""
    maintenance_service = MaintenanceService(db)

    skip = (page - 1) * per_page

    try:
        entries = maintenance_service.get_maintenances(
            vehicle_id=vehicle_id,
            maintenance_type=maintenance_type,
            start_date=start_date,
            end_date=end_date,
            skip=skip,
            limit=per_page,
            order_by=order_by.value,
            order=order
        )

        total = maintenance_service.get_maintenances_count(
            vehicle_id=vehicle_id,
            maintenance_type=maintenance_type,
            start_date=start_date,
            end_date=end_date
        )

        pages = (total + per_page - 1) // per_page

        return MaintenanceListResponse(
            entries=entries,
            total=total,
            page=page,
            per_page=per_page,
            pages=pages
        )
    except Exception:
        logger.exception("Unexpected error fetching maintenance entries")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Erreur lors de la récupération des entrées de maintenance"
        )


@router.get("/{maintenance_id}", response_model=MaintenanceResponse)
def get_maintenance(
    maintenance_id: int = Path(..., description="Maintenance entry ID"),
    db: Session = Depends(get_db)
):
    """Get a specific maintenance entry by ID"""
    maintenance_service = MaintenanceService(db)

    db_maintenance = maintenance_service.get_maintenance(maintenance_id)
    if not db_maintenance:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Maintenance entry not found"
        )
    return db_maintenance


@router.put("/{maintenance_id}", response_model=MaintenanceResponse)
def update_maintenance(
    maintenance_id: int = Path(..., description="Maintenance entry ID"),
    maintenance_update: MaintenanceUpdate = None,
    db: Session = Depends(get_db)
):
    """Update a maintenance entry"""
    maintenance_service = MaintenanceService(db)

    try:
        db_maintenance = maintenance_service.update_maintenance(maintenance_id, maintenance_update)
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=str(e))
    if not db_maintenance:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Maintenance entry not found"
        )
    return db_maintenance


@router.delete("/{maintenance_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_maintenance(
    maintenance_id: int = Path(..., description="Maintenance entry ID"),
    db: Session = Depends(get_db)
):
    """Delete a maintenance entry"""
    maintenance_service = MaintenanceService(db)

    if not maintenance_service.delete_maintenance(maintenance_id):
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Maintenance entry not found"
        )


@router.get("/vehicle/{vehicle_id}", response_model=List[MaintenanceResponse])
def get_maintenances_by_vehicle(
    vehicle_id: int = Path(..., description="Vehicle ID"),
    page: int = Query(1, ge=1, description="Page number"),
    per_page: int = Query(20, ge=1, le=100, description="Items per page"),
    db: Session = Depends(get_db)
):
    """Get all maintenance entries for a specific vehicle"""
    maintenance_service = MaintenanceService(db)

    skip = (page - 1) * per_page

    try:
        entries = maintenance_service.get_maintenances_by_vehicle(
            vehicle_id=vehicle_id,
            skip=skip,
            limit=per_page
        )
        return entries
    except Exception:
        logger.exception("Unexpected error fetching maintenance entries for vehicle %s", vehicle_id)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Erreur lors de la récupération des entrées de maintenance"
        )


@router.get("/vehicle/{vehicle_id}/latest", response_model=MaintenanceResponse)
def get_latest_maintenance_by_vehicle(
    vehicle_id: int = Path(..., description="Vehicle ID"),
    db: Session = Depends(get_db)
):
    """Get the latest maintenance entry for a specific vehicle"""
    maintenance_service = MaintenanceService(db)

    latest_entry = maintenance_service.get_latest_maintenance_by_vehicle(vehicle_id)
    if not latest_entry:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="No maintenance entries found for this vehicle"
        )
    return latest_entry


@router.get("/vehicle/{vehicle_id}/statistics", response_model=MaintenanceStatisticsResponse)
def get_maintenance_statistics_by_vehicle(
    vehicle_id: int = Path(..., description="Vehicle ID"),
    db: Session = Depends(get_db)
):
    """Get maintenance statistics for a specific vehicle"""
    maintenance_service = MaintenanceService(db)

    try:
        statistics = maintenance_service.get_maintenance_statistics_by_vehicle(vehicle_id)
        return statistics
    except Exception:
        logger.exception("Unexpected error calculating maintenance statistics for vehicle %s", vehicle_id)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Erreur lors du calcul des statistiques de maintenance"
        )
