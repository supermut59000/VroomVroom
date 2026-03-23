import logging
from typing import List
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.api.deps import get_db
from app.services.flexfuel_service import FlexfuelService
from app.schemas.flexfuel import (
    FlexfuelConversionCreate,
    FlexfuelConversionUpdate,
    FlexfuelConversionResponse,
    E10ReferencePriceCreate,
    E10ReferencePriceUpdate,
    E10ReferencePriceResponse,
    FlexfuelRentabilitySummary,
)

logger = logging.getLogger(__name__)

router = APIRouter()


# ---- Conversion endpoints ----

@router.post(
    "/vehicles/{vehicle_id}/conversion",
    response_model=FlexfuelConversionResponse,
    status_code=status.HTTP_201_CREATED,
)
def create_conversion(
    vehicle_id: int,
    data: FlexfuelConversionCreate,
    db: Session = Depends(get_db),
):
    """Record a FlexFuel conversion for a vehicle."""
    service = FlexfuelService(db)
    existing = service.get_conversion(vehicle_id)
    if existing:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Ce véhicule a déjà une conversion FlexFuel enregistrée",
        )
    data.vehicle_id = vehicle_id
    return service.create_conversion(data)


@router.get(
    "/vehicles/{vehicle_id}/conversion",
    response_model=FlexfuelConversionResponse,
)
def get_conversion(vehicle_id: int, db: Session = Depends(get_db)):
    """Get FlexFuel conversion for a vehicle."""
    service = FlexfuelService(db)
    conversion = service.get_conversion(vehicle_id)
    if not conversion:
        raise HTTPException(status_code=404, detail="Aucune conversion FlexFuel trouvée")
    return conversion


@router.put(
    "/vehicles/{vehicle_id}/conversion",
    response_model=FlexfuelConversionResponse,
)
def update_conversion(
    vehicle_id: int,
    data: FlexfuelConversionUpdate,
    db: Session = Depends(get_db),
):
    """Update FlexFuel conversion."""
    service = FlexfuelService(db)
    conversion = service.update_conversion(vehicle_id, data)
    if not conversion:
        raise HTTPException(status_code=404, detail="Aucune conversion FlexFuel trouvée")
    return conversion


@router.delete("/vehicles/{vehicle_id}/conversion", status_code=status.HTTP_204_NO_CONTENT)
def delete_conversion(vehicle_id: int, db: Session = Depends(get_db)):
    """Delete FlexFuel conversion."""
    service = FlexfuelService(db)
    if not service.delete_conversion(vehicle_id):
        raise HTTPException(status_code=404, detail="Aucune conversion FlexFuel trouvée")


# ---- E10 Reference Price endpoints ----

@router.post(
    "/vehicles/{vehicle_id}/e10-prices",
    response_model=E10ReferencePriceResponse,
    status_code=status.HTTP_201_CREATED,
)
def create_e10_price(
    vehicle_id: int,
    data: E10ReferencePriceCreate,
    db: Session = Depends(get_db),
):
    """Add an E10 reference price."""
    data.vehicle_id = vehicle_id
    service = FlexfuelService(db)
    return service.create_e10_price(data)


@router.get(
    "/vehicles/{vehicle_id}/e10-prices",
    response_model=List[E10ReferencePriceResponse],
)
def get_e10_prices(vehicle_id: int, db: Session = Depends(get_db)):
    """List E10 reference prices for a vehicle."""
    service = FlexfuelService(db)
    return service.get_e10_prices(vehicle_id)


@router.put(
    "/e10-prices/{price_id}",
    response_model=E10ReferencePriceResponse,
)
def update_e10_price(
    price_id: int,
    data: E10ReferencePriceUpdate,
    db: Session = Depends(get_db),
):
    """Update an E10 reference price."""
    service = FlexfuelService(db)
    price = service.update_e10_price(price_id, data)
    if not price:
        raise HTTPException(status_code=404, detail="Prix E10 non trouvé")
    return price


@router.delete("/e10-prices/{price_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_e10_price(price_id: int, db: Session = Depends(get_db)):
    """Delete an E10 reference price."""
    service = FlexfuelService(db)
    if not service.delete_e10_price(price_id):
        raise HTTPException(status_code=404, detail="Prix E10 non trouvé")


# ---- Rentability endpoint ----

@router.get(
    "/vehicles/{vehicle_id}/rentability",
    response_model=FlexfuelRentabilitySummary,
)
def get_rentability(vehicle_id: int, db: Session = Depends(get_db)):
    """Calculate E85 FlexFuel rentability for a vehicle."""
    service = FlexfuelService(db)
    result = service.calculate_rentability(vehicle_id)
    if result is None:
        raise HTTPException(status_code=404, detail="Aucune conversion FlexFuel trouvée")
    return result
