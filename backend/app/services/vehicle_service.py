from typing import List, Optional
from sqlalchemy.orm import Session
from sqlalchemy import and_, desc, func
from datetime import datetime, date

from app.models.vehicle import Vehicle
from app.models.fuel_entry import FuelEntry
from app.models.maintenance import Maintenance

from app.schemas.vehicle import VehicleCreate, VehicleUpdate, VehicleStats, VehicleTimeline, VehicleTimelineEvent
from app.core.enums import FuelType
from app.services.fuel_service import FuelService

class VehicleService:
    def __init__(self, db: Session):
        self.db = db

    def get_vehicles(
        self, 
        skip: int = 0, 
        limit: int = 100, 
        active_only: bool = True,
        fuel_type: Optional[FuelType] = None
    ) -> List[Vehicle]:
        """
        Récupère la liste des véhicules avec filtres.
        """
        query = self.db.query(Vehicle)
        
        # Filtres
        if active_only:
            query = query.filter(Vehicle.is_active == True)
        
        if fuel_type:
            query = query.filter(Vehicle.fuel_type == fuel_type.value)
        
        # Tri par date de création décroissante
        query = query.order_by(Vehicle.created_at.desc())
        
        return query.offset(skip).limit(limit).all()

    def get_vehicle(self, vehicle_id: int) -> Optional[Vehicle]:
        """
        Récupère un véhicule par son ID.
        """
        return self.db.query(Vehicle).filter(Vehicle.id == vehicle_id).first()

    def get_vehicle_by_license_plate(self, license_plate: str) -> Optional[Vehicle]:
        """
        Récupère un véhicule par sa plaque d'immatriculation.
        """
        return self.db.query(Vehicle).filter(
            Vehicle.license_plate == license_plate.upper()
        ).first()

    def create_vehicle(self, vehicle_data: VehicleCreate) -> Vehicle:
        """
        Créé un nouveau véhicule.
        """
        db_vehicle = Vehicle(**vehicle_data.dict())
        self.db.add(db_vehicle)
        self.db.commit()
        self.db.refresh(db_vehicle)
        return db_vehicle

    def update_vehicle(self, vehicle_id: int, vehicle_data: VehicleUpdate) -> Vehicle:
        """
        Met à jour un véhicule.
        """
        db_vehicle = self.get_vehicle(vehicle_id)
        if not db_vehicle:
            raise ValueError("Véhicule non trouvé")
        
        # Mise à jour uniquement des champs fournis
        update_data = vehicle_data.dict(exclude_unset=True)
        for field, value in update_data.items():
            setattr(db_vehicle, field, value)
        
        self.db.commit()
        self.db.refresh(db_vehicle)
        return db_vehicle

    def delete_vehicle(self, vehicle_id: int, force: bool = False) -> bool:
        """
        Supprime un véhicule (soft delete par défaut).
        """
        db_vehicle = self.get_vehicle(vehicle_id)
        if not db_vehicle:
            return False
        
        if force:
            # Suppression physique
            self.db.delete(db_vehicle)
        else:
            # Vérifier s'il y a des données liées (à implémenter plus tard)
            # if self._has_related_data(vehicle_id):
            #     raise ValueError("Impossible de supprimer un véhicule avec des données associées")
            
            # Soft delete
            db_vehicle.is_active = False
        
        self.db.commit()
        return True

    def archive_vehicle(self, vehicle_id: int) -> Optional[Vehicle]:
        """
        Archive un véhicule (le rend inactif).
        """
        db_vehicle = self.get_vehicle(vehicle_id)
        if db_vehicle:
            db_vehicle.is_active = False
            self.db.commit()
            self.db.refresh(db_vehicle)
        return db_vehicle

    def _calculate_current_insurance_limit(self, vehicle: Vehicle) -> Optional[float]:
        """
        Calculate the current insurance km limit based on the start date and annual increases.
        """
        if not vehicle.insurance_km_limit or not vehicle.insurance_km_start_date:
            return None

        # Calculate years elapsed since start date
        today = date.today()
        start_date = vehicle.insurance_km_start_date

        # Calculate full years elapsed
        years_elapsed = (today.year - start_date.year)

        # Adjust if we haven't reached the anniversary date this year
        if today.month < start_date.month or (today.month == start_date.month and today.day < start_date.day):
            years_elapsed -= 1

        # Calculate current limit
        annual_increase = vehicle.insurance_km_annual_increase or 0
        current_limit = vehicle.insurance_km_limit + (years_elapsed * annual_increase)

        return current_limit

    def get_vehicle_timeline(self, vehicle_id: int) -> VehicleTimeline:
        """Return fuel entries and maintenance entries merged and sorted chronologically."""
        fuel_entries = (
            self.db.query(FuelEntry)
            .filter(FuelEntry.vehicle_id == vehicle_id, FuelEntry.is_active == True)
            .all()
        )
        maintenances = (
            self.db.query(Maintenance)
            .filter(Maintenance.vehicle_id == vehicle_id, Maintenance.is_active == True)
            .all()
        )

        events: list[VehicleTimelineEvent] = []

        for e in fuel_entries:
            events.append(VehicleTimelineEvent(
                event_type="fuel",
                event_date=e.fueling_date,
                event_id=e.id,
                odometer_reading=e.odometer_reading,
                data={
                    "fuel_type": e.fuel_type.value if e.fuel_type else None,
                    "liters": e.liters,
                    "price_per_liter": e.price_per_liter,
                    "total_cost": e.total_cost,
                    "station_name": e.station_name,
                    "location": e.location,
                    "is_full_tank": e.is_full_tank,
                    "notes": e.notes,
                },
            ))

        for m in maintenances:
            events.append(VehicleTimelineEvent(
                event_type="maintenance",
                event_date=m.maintenance_date,
                event_id=m.id,
                odometer_reading=m.odometer_reading,
                data={
                    "maintenance_type": m.maintenance_type,
                    "description": m.description,
                    "cost": m.cost,
                    "service_provider": m.service_provider,
                    "location": m.location,
                    "next_maintenance_date": m.next_maintenance_date.isoformat() if m.next_maintenance_date else None,
                    "next_maintenance_odometer": m.next_maintenance_odometer,
                    "notes": m.notes,
                },
            ))

        events.sort(key=lambda ev: (ev.event_date, ev.odometer_reading), reverse=True)

        return VehicleTimeline(vehicle_id=vehicle_id, events=events)

    def _compute_seasonal_consumption(self, vehicle_id: int) -> dict:
        """
        Compute average L/100km per meteorological season from fill-to-fill consumption history.
        Seasons: Printemps (3-5), Été (6-8), Automne (9-11), Hiver (12-2).
        Uses the fuel entry date to assign each consumption value to a season.
        Returns dict with keys: spring, summer, autumn, winter (each Optional[float]).
        """
        entries = (
            self.db.query(FuelEntry)
            .filter(FuelEntry.vehicle_id == vehicle_id, FuelEntry.is_active == True)
            .order_by(FuelEntry.fueling_date, FuelEntry.odometer_reading)
            .all()
        )

        if len(entries) < 2:
            return {"spring": None, "summer": None, "autumn": None, "winter": None}

        def month_to_season(month: int) -> str:
            if month in (3, 4, 5):
                return "spring"
            elif month in (6, 7, 8):
                return "summer"
            elif month in (9, 10, 11):
                return "autumn"
            else:  # 12, 1, 2
                return "winter"

        season_buckets: dict = {"spring": [], "summer": [], "autumn": [], "winter": []}

        accumulated_liters = 0.0
        last_full_tank_odometer = None

        for i, entry in enumerate(entries):
            is_full = getattr(entry, "is_full_tank", True)

            if i == 0:
                if is_full:
                    last_full_tank_odometer = float(entry.odometer_reading)
                    accumulated_liters = 0.0
                else:
                    last_full_tank_odometer = float(entry.odometer_reading)
                    accumulated_liters = entry.liters
            else:
                if is_full:
                    total_liters_for_calc = accumulated_liters + entry.liters
                    if last_full_tank_odometer is not None:
                        distance = float(entry.odometer_reading) - last_full_tank_odometer
                        if distance > 0:
                            consumption = (total_liters_for_calc * 100) / distance
                            season = month_to_season(entry.fueling_date.month)
                            season_buckets[season].append(consumption)
                    last_full_tank_odometer = float(entry.odometer_reading)
                    accumulated_liters = 0.0
                else:
                    accumulated_liters += entry.liters

        return {
            season: round(sum(vals) / len(vals), 2) if vals else None
            for season, vals in season_buckets.items()
        }

    def get_vehicle_stats(self, vehicle_id: int) -> VehicleStats:
        """
        Calcule les statistiques d'un véhicule basées sur les entrées de carburant.
        Délègue le calcul de consommation à FuelService (source unique de vérité).
        """
        vehicle = self.db.query(Vehicle).filter(Vehicle.id == vehicle_id).first()
        if not vehicle:
            raise ValueError(f"Vehicle with id {vehicle_id} not found")

        # Delegate fuel statistics to FuelService (single source of truth)
        fuel_service = FuelService(self.db)
        fuel_stats = fuel_service.get_fuel_statistics_by_vehicle(vehicle_id)

        # Get last odometer and days since last entry from fuel entries
        fuel_entries = (
            self.db.query(FuelEntry)
            .filter(FuelEntry.vehicle_id == vehicle_id, FuelEntry.is_active == True)
            .order_by(FuelEntry.odometer_reading.desc())
            .all()
        )

        last_odometer = None
        days_since_last_entry = None
        total_distance = 0.0

        if fuel_entries:
            last_entry = fuel_entries[0]  # Already sorted desc
            last_odometer = float(last_entry.odometer_reading)

            if last_entry.fueling_date:
                days_since_last_entry = (date.today() - last_entry.fueling_date).days

            # Distance = last odometer - initial odometer
            if last_odometer and vehicle.initial_odometer is not None:
                total_distance = last_odometer - float(vehicle.initial_odometer)
            elif fuel_stats["total_distance"] > 0:
                total_distance = float(fuel_stats["total_distance"])
        else:
            last_odometer = vehicle.initial_odometer

        # Cost per km
        total_fuel_cost = fuel_stats["total_cost"]
        cost_per_km = total_fuel_cost / total_distance if total_distance > 0 else 0

        # Insurance limit calculation
        current_insurance_limit = self._calculate_current_insurance_limit(vehicle)
        insurance_km_remaining = None
        insurance_km_exceeded = False

        ref_odometer = last_odometer if last_odometer is not None else vehicle.initial_odometer
        if current_insurance_limit is not None and ref_odometer is not None:
            insurance_km_remaining = current_insurance_limit - ref_odometer
            insurance_km_exceeded = insurance_km_remaining < 0

        # Seasonal consumption + range
        seasonal = self._compute_seasonal_consumption(vehicle_id)
        tank = vehicle.tank_capacity

        def _range(conso: Optional[float]) -> Optional[float]:
            if conso and conso > 0 and tank:
                return round(tank * 100 / conso, 0)
            return None

        return VehicleStats(
            vehicle_id=vehicle_id,
            total_fuel_entries=fuel_stats["total_entries"],
            total_fuel_quantity=fuel_stats["total_liters"],
            total_distance=total_distance,
            average_consumption=fuel_stats["average_consumption"],
            average_fuel_price=fuel_stats["average_price_per_liter"],
            total_fuel_cost=round(total_fuel_cost, 2),
            cost_per_km=round(cost_per_km, 3),
            last_odometer=last_odometer,
            days_since_last_entry=days_since_last_entry,
            current_insurance_km_limit=round(current_insurance_limit, 2) if current_insurance_limit else None,
            insurance_km_remaining=round(insurance_km_remaining, 2) if insurance_km_remaining is not None else None,
            insurance_km_exceeded=insurance_km_exceeded,
            spring_avg_consumption=seasonal["spring"],
            summer_avg_consumption=seasonal["summer"],
            autumn_avg_consumption=seasonal["autumn"],
            winter_avg_consumption=seasonal["winter"],
            range_km=_range(fuel_stats["average_consumption"]),
            range_km_spring=_range(seasonal["spring"]),
            range_km_summer=_range(seasonal["summer"]),
            range_km_autumn=_range(seasonal["autumn"]),
            range_km_winter=_range(seasonal["winter"]),
        )
