import logging
from enum import Enum
from typing import List, Optional
from datetime import date
from fastapi import APIRouter, Depends, HTTPException, Query, Path, status
from sqlalchemy.orm import Session

from app.api.deps import get_db
from app.services.fuel_service import FuelService
from app.schemas.fuel_entry import (
    FuelEntryCreate,
    FuelEntryUpdate,
    FuelEntryResponse,
    FuelEntryListResponse,
    FuelStatisticsResponse,
    ConsumptionHistoryResponse,
)
from app.core.enums import FuelType

logger = logging.getLogger(__name__)

router = APIRouter()


class FuelEntryOrderBy(str, Enum):
    fueling_date = "fueling_date"
    created_at = "created_at"
    odometer_reading = "odometer_reading"
    total_cost = "total_cost"
    liters = "liters"
    price_per_liter = "price_per_liter"


@router.post("/", response_model=FuelEntryResponse, status_code=status.HTTP_201_CREATED)
def create_fuel_entry(
    fuel_entry: FuelEntryCreate,
    allow_odometer_decrease: bool = Query(False, description="Autoriser un kilométrage décroissant (remise à zéro compteur)"),
    db: Session = Depends(get_db)
):
    """Create a new fuel entry"""
    fuel_service = FuelService(db)
    try:
        return fuel_service.create_fuel_entry(fuel_entry, allow_odometer_decrease=allow_odometer_decrease)
    except ValueError as e:
        logger.warning("Validation error creating fuel entry for vehicle %d: %s", fuel_entry.vehicle_id, e)
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=str(e))
    except Exception:
        logger.exception("Unexpected error creating fuel entry")
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Erreur interne du serveur")


@router.get("/", response_model=FuelEntryListResponse)
def get_fuel_entries(
    vehicle_id: Optional[int] = Query(None, description="Filter by vehicle ID"),
    fuel_type: Optional[FuelType] = Query(None, description="Filter by fuel type"),
    start_date: Optional[date] = Query(None, description="Filter by start date"),
    end_date: Optional[date] = Query(None, description="Filter by end date"),
    page: int = Query(1, ge=1, description="Page number"),
    per_page: int = Query(20, ge=1, le=500, description="Items per page"),
    order_by: FuelEntryOrderBy = Query(FuelEntryOrderBy.fueling_date, description="Order by field"),
    order: str = Query("desc", pattern="^(asc|desc)$", description="Order direction"),
    db: Session = Depends(get_db)
):
    """Get fuel entries with optional filters and pagination"""
    fuel_service = FuelService(db)

    skip = (page - 1) * per_page

    entries = fuel_service.get_fuel_entries(
        vehicle_id=vehicle_id,
        fuel_type=fuel_type,
        start_date=start_date,
        end_date=end_date,
        skip=skip,
        limit=per_page,
        order_by=order_by.value,
        order=order
    )

    total = fuel_service.get_fuel_entries_count(
        vehicle_id=vehicle_id,
        fuel_type=fuel_type,
        start_date=start_date,
        end_date=end_date
    )

    pages = (total + per_page - 1) // per_page

    return FuelEntryListResponse(
        entries=entries,
        total=total,
        page=page,
        per_page=per_page,
        pages=pages
    )


@router.get("/stations", response_model=List[str])
def get_station_names(
    vehicle_id: Optional[int] = Query(None, description="Filter by vehicle ID"),
    db: Session = Depends(get_db)
):
    """Get distinct fuel station names, optionally filtered by vehicle"""
    fuel_service = FuelService(db)
    return fuel_service.get_distinct_station_names(vehicle_id=vehicle_id)


@router.get("/{entry_id}", response_model=FuelEntryResponse)
def get_fuel_entry(
    entry_id: int = Path(..., description="Fuel entry ID"),
    db: Session = Depends(get_db)
):
    """Get a specific fuel entry by ID"""
    fuel_service = FuelService(db)

    db_fuel_entry = fuel_service.get_fuel_entry(entry_id)
    if not db_fuel_entry:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Fuel entry not found")
    return db_fuel_entry


@router.put("/{entry_id}", response_model=FuelEntryResponse)
def update_fuel_entry(
    entry_id: int = Path(..., description="Fuel entry ID"),
    fuel_entry_update: FuelEntryUpdate = ...,
    db: Session = Depends(get_db)
):
    """Update a fuel entry"""
    fuel_service = FuelService(db)

    try:
        db_fuel_entry = fuel_service.update_fuel_entry(entry_id, fuel_entry_update)
    except Exception:
        logger.exception("Unexpected error updating fuel entry %d", entry_id)
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Erreur interne du serveur")
    if not db_fuel_entry:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Fuel entry not found")
    return db_fuel_entry


@router.delete("/{entry_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_fuel_entry(
    entry_id: int = Path(..., description="Fuel entry ID"),
    db: Session = Depends(get_db)
):
    """Delete a fuel entry"""
    fuel_service = FuelService(db)

    if not fuel_service.delete_fuel_entry(entry_id):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Fuel entry not found")


@router.get("/vehicle/{vehicle_id}/nearest-station")
def get_nearest_station(
    vehicle_id: int = Path(..., description="Vehicle ID"),
    lat: float = Query(..., ge=-90, le=90, description="Current latitude"),
    lon: float = Query(..., ge=-180, le=180, description="Current longitude"),
    radius_m: float = Query(250, ge=1, le=500, description="Search radius in metres"),
    db: Session = Depends(get_db),
):
    """Return station name from the closest past fill within radius_m metres."""
    fuel_service = FuelService(db)
    result = fuel_service.get_nearest_station(vehicle_id, lat, lon, radius_m)
    if result is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Aucune station connue à proximité")
    return result


@router.get("/vehicle/{vehicle_id}", response_model=List[FuelEntryResponse])
def get_fuel_entries_by_vehicle(
    vehicle_id: int = Path(..., description="Vehicle ID"),
    page: int = Query(1, ge=1, description="Page number"),
    per_page: int = Query(20, ge=1, le=500, description="Items per page"),
    db: Session = Depends(get_db)
):
    """Get all fuel entries for a specific vehicle"""
    fuel_service = FuelService(db)

    skip = (page - 1) * per_page
    return fuel_service.get_fuel_entries_by_vehicle(
        vehicle_id=vehicle_id,
        skip=skip,
        limit=per_page
    )


@router.get("/vehicle/{vehicle_id}/latest", response_model=FuelEntryResponse)
def get_latest_fuel_entry_by_vehicle(
    vehicle_id: int = Path(..., description="Vehicle ID"),
    db: Session = Depends(get_db)
):
    """Get the latest fuel entry for a specific vehicle"""
    fuel_service = FuelService(db)

    latest_entry = fuel_service.get_latest_fuel_entry_by_vehicle(vehicle_id)
    if not latest_entry:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="No fuel entries found for this vehicle")
    return latest_entry


@router.get("/vehicle/{vehicle_id}/statistics", response_model=FuelStatisticsResponse)
def get_fuel_statistics_by_vehicle(
    vehicle_id: int = Path(..., description="Vehicle ID"),
    db: Session = Depends(get_db)
):
    """Get fuel statistics for a specific vehicle"""
    fuel_service = FuelService(db)
    return fuel_service.get_fuel_statistics_by_vehicle(vehicle_id)


@router.get("/vehicle/{vehicle_id}/consumption-history", response_model=ConsumptionHistoryResponse)
def get_consumption_history_by_vehicle(
    vehicle_id: int = Path(..., description="Vehicle ID"),
    db: Session = Depends(get_db)
):
    """Get consumption history (L/100km) for a specific vehicle"""
    fuel_service = FuelService(db)
    return fuel_service.get_consumption_history(vehicle_id)
