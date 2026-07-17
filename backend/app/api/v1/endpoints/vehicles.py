import logging
from datetime import date
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, status, Query
from sqlalchemy.orm import Session

logger = logging.getLogger(__name__)

from app.api.deps import get_db
from app.schemas.vehicle import (
    VehicleCreate,
    VehicleUpdate,
    VehicleResponse,
    VehicleList,
    VehicleStats,
    VehicleTimeline,
    VehiclePeriodStats,
)
from app.core.enums import FuelType
from app.services.vehicle_service import VehicleService

router = APIRouter()


@router.get("/", response_model=List[VehicleList])
def get_vehicles(
    skip: int = Query(0, ge=0, description="Nombre d'éléments à ignorer"),
    limit: int = Query(100, ge=1, le=1000, description="Nombre maximum d'éléments à retourner"),
    active_only: bool = Query(True, description="Afficher seulement les véhicules actifs"),
    fuel_type: Optional[FuelType] = Query(None, description="Filtrer par type de carburant"),
    db: Session = Depends(get_db)
):
    """
    Récupère la liste des véhicules avec pagination et filtres.
    """
    vehicle_service = VehicleService(db)
    return vehicle_service.get_vehicles(
        skip=skip, 
        limit=limit, 
        active_only=active_only,
        fuel_type=fuel_type
    )


@router.post("/", response_model=VehicleResponse, status_code=status.HTTP_201_CREATED)
def create_vehicle(
    vehicle: VehicleCreate,
    db: Session = Depends(get_db)
):
    """
    Créé un nouveau véhicule.
    """
    vehicle_service = VehicleService(db)
    
    # Vérifier si la plaque existe déjà
    if vehicle_service.get_vehicle_by_license_plate(vehicle.license_plate):
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Un véhicule avec cette plaque d'immatriculation existe déjà"
        )
    
    return vehicle_service.create_vehicle(vehicle)


@router.get("/{vehicle_id}", response_model=VehicleResponse)
def get_vehicle(
    vehicle_id: int,
    db: Session = Depends(get_db)
):
    """
    Récupère un véhicule par son ID.
    """
    vehicle_service = VehicleService(db)
    vehicle = vehicle_service.get_vehicle(vehicle_id)
    
    if not vehicle:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Véhicule non trouvé"
        )
    
    return vehicle


@router.put("/{vehicle_id}", response_model=VehicleResponse)
def update_vehicle(
    vehicle_id: int,
    vehicle_update: VehicleUpdate,
    db: Session = Depends(get_db)
):
    """
    Met à jour un véhicule.
    """
    vehicle_service = VehicleService(db)
    
    # Vérifier si le véhicule existe
    existing_vehicle = vehicle_service.get_vehicle(vehicle_id)
    if not existing_vehicle:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Véhicule non trouvé"
        )
    
    # Vérifier l'unicité de la plaque si elle est modifiée
    if vehicle_update.license_plate:
        existing_with_plate = vehicle_service.get_vehicle_by_license_plate(
            vehicle_update.license_plate
        )
        if existing_with_plate and existing_with_plate.id != vehicle_id:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="Un autre véhicule possède déjà cette plaque d'immatriculation"
            )
    
    return vehicle_service.update_vehicle(vehicle_id, vehicle_update)


@router.delete("/{vehicle_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_vehicle(
    vehicle_id: int,
    force: bool = Query(False, description="Suppression forcée même avec des données liées"),
    db: Session = Depends(get_db)
):
    """
    Supprime un véhicule (soft delete par défaut).
    """
    vehicle_service = VehicleService(db)
    
    if not vehicle_service.get_vehicle(vehicle_id):
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Véhicule non trouvé"
        )
    
    try:
        vehicle_service.delete_vehicle(vehicle_id, force=force)
    except ValueError as e:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=str(e)
        )


@router.get("/stats/batch", response_model=dict[int, VehicleStats])
def get_vehicles_stats_batch(
    db: Session = Depends(get_db)
):
    """
    Récupère les statistiques de tous les véhicules actifs en un seul appel.
    Résout le problème N+1 du dashboard.
    """
    vehicle_service = VehicleService(db)
    vehicles = vehicle_service.get_vehicles(active_only=True)
    result = {}
    for v in vehicles:
        try:
            result[v.id] = vehicle_service.get_vehicle_stats(v.id)
        except Exception:
            logger.exception("Failed to compute stats for vehicle %d in batch", v.id)
    return result


@router.get("/{vehicle_id}/period-stats", response_model=VehiclePeriodStats)
def get_vehicle_period_stats(
    vehicle_id: int,
    start_date: date = Query(..., description="Début de la période (inclus)"),
    end_date: date = Query(..., description="Fin de la période (incluse)"),
    db: Session = Depends(get_db)
):
    """
    Bilan entre deux dates : km, consommation, coûts, économies E85.
    """
    if end_date < start_date:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="La date de fin doit être postérieure à la date de début",
        )

    vehicle_service = VehicleService(db)
    try:
        return vehicle_service.get_period_stats(vehicle_id, start_date, end_date)
    except ValueError:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Véhicule non trouvé",
        )


@router.get("/{vehicle_id}/stats", response_model=VehicleStats)
def get_vehicle_stats(
    vehicle_id: int,
    db: Session = Depends(get_db)
):
    """
    Récupère les statistiques d'un véhicule.
    """
    vehicle_service = VehicleService(db)
    
    if not vehicle_service.get_vehicle(vehicle_id):
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Véhicule non trouvé"
        )
    
    return vehicle_service.get_vehicle_stats(vehicle_id)


@router.get("/{vehicle_id}/timeline", response_model=VehicleTimeline)
def get_vehicle_timeline(
    vehicle_id: int,
    db: Session = Depends(get_db)
):
    """
    Retourne l'historique unifié d'un véhicule (pleins + maintenances) trié par date décroissante.
    """
    vehicle_service = VehicleService(db)

    if not vehicle_service.get_vehicle(vehicle_id):
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Véhicule non trouvé"
        )

    return vehicle_service.get_vehicle_timeline(vehicle_id)


@router.post("/{vehicle_id}/archive", response_model=VehicleResponse)
def archive_vehicle(
    vehicle_id: int,
    db: Session = Depends(get_db)
):
    """
    Archive un véhicule (le rend inactif).
    """
    vehicle_service = VehicleService(db)
    
    if not vehicle_service.get_vehicle(vehicle_id):
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Véhicule non trouvé"
        )
    
    return vehicle_service.archive_vehicle(vehicle_id)
