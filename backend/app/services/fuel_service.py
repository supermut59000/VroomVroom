from typing import List, Optional
from sqlalchemy.orm import Session
from sqlalchemy import and_, desc, asc
from sqlalchemy.exc import IntegrityError
from app.models.fuel_entry import FuelEntry
from app.core.enums import FuelType
from app.schemas.fuel_entry import FuelEntryCreate, FuelEntryUpdate, FuelStatisticsResponse
from datetime import date, datetime


class FuelService:
    def __init__(self, db: Session):
        self.db = db

    def _assert_vehicle_exists(self, vehicle_id: int):
        from app.models.vehicle import Vehicle
        vehicle = self.db.query(Vehicle).filter(Vehicle.id == vehicle_id).first()
        if not vehicle:
            raise ValueError(f"Véhicule avec l'id {vehicle_id} introuvable")
        return vehicle

    def create_fuel_entry(self, fuel_entry: FuelEntryCreate, allow_odometer_decrease: bool = False) -> FuelEntry:
        """Create a new fuel entry."""
        client_request_id = str(fuel_entry.client_request_id) if fuel_entry.client_request_id else None
        if client_request_id:
            existing = self.db.query(FuelEntry).filter(
                FuelEntry.client_request_id == client_request_id
            ).first()
            if existing:
                if existing.vehicle_id != fuel_entry.vehicle_id:
                    raise ValueError("Identifiant de requête déjà utilisé pour un autre véhicule")
                return existing

        vehicle = self._assert_vehicle_exists(fuel_entry.vehicle_id)
        if fuel_entry.odometer_reading < (vehicle.initial_odometer or 0):
            raise ValueError(
                f"Le kilométrage {fuel_entry.odometer_reading} km est inférieur "
                f"au kilométrage initial du véhicule ({vehicle.initial_odometer:g} km)"
            )

        # Odometer monotonicity — allow equal (blend fills share same odometer)
        if not allow_odometer_decrease:
            latest = (
                self.db.query(FuelEntry)
                .filter(FuelEntry.vehicle_id == fuel_entry.vehicle_id, FuelEntry.is_active == True)
                .order_by(FuelEntry.odometer_reading.desc())
                .first()
            )
            if latest and fuel_entry.odometer_reading < latest.odometer_reading:
                raise ValueError(
                    f"Le kilométrage {fuel_entry.odometer_reading} km est inférieur "
                    f"au dernier relevé ({latest.odometer_reading} km)"
                )

        # Calculate total cost
        total_cost = fuel_entry.liters * fuel_entry.price_per_liter

        db_fuel_entry = FuelEntry(
            vehicle_id=fuel_entry.vehicle_id,
            fuel_type=fuel_entry.fuel_type,
            liters=fuel_entry.liters,
            price_per_liter=fuel_entry.price_per_liter,
            total_cost=total_cost,
            odometer_reading=fuel_entry.odometer_reading,
            station_name=fuel_entry.station_name,
            location=fuel_entry.location,
            latitude=fuel_entry.latitude,
            longitude=fuel_entry.longitude,
            fueling_date=fuel_entry.fueling_date,
            is_full_tank=fuel_entry.is_full_tank,
            notes=fuel_entry.notes,
            client_request_id=client_request_id,
        )

        self.db.add(db_fuel_entry)
        try:
            self.db.commit()
        except IntegrityError:
            self.db.rollback()
            if client_request_id:
                existing = self.db.query(FuelEntry).filter(
                    FuelEntry.client_request_id == client_request_id
                ).first()
                if existing:
                    return existing
            raise
        self.db.refresh(db_fuel_entry)
        return db_fuel_entry

    def get_fuel_entry(self, entry_id: int) -> Optional[FuelEntry]:
        """Get a fuel entry by ID"""
        return self.db.query(FuelEntry).filter(FuelEntry.id == entry_id, FuelEntry.is_active == True).first()

    def get_fuel_entries(
        self,
        vehicle_id: Optional[int] = None,
        fuel_type: Optional[FuelType] = None,
        start_date: Optional[date] = None,
        end_date: Optional[date] = None,
        skip: int = 0,
        limit: int = 100,
        order_by: str = "fueling_date",
        order: str = "desc"
    ) -> List[FuelEntry]:
        """Get fuel entries with optional filters"""
        query = self.db.query(FuelEntry).filter(FuelEntry.is_active == True)

        # Apply filters
        if vehicle_id is not None:
            query = query.filter(FuelEntry.vehicle_id == vehicle_id)
        
        if fuel_type is not None:
            query = query.filter(FuelEntry.fuel_type == fuel_type)
        
        if start_date is not None:
            query = query.filter(FuelEntry.fueling_date >= start_date)
        
        if end_date is not None:
            query = query.filter(FuelEntry.fueling_date <= end_date)
        
        # Apply ordering
        order_column = getattr(FuelEntry, order_by, FuelEntry.fueling_date)
        if order.lower() == "asc":
            query = query.order_by(asc(order_column))
        else:
            query = query.order_by(desc(order_column))
        
        return query.offset(skip).limit(limit).all()

    def get_fuel_entries_by_vehicle(
        self,
        vehicle_id: int,
        skip: int = 0,
        limit: int = 100
    ) -> List[FuelEntry]:
        """Get all fuel entries for a specific vehicle"""
        return (
            self.db.query(FuelEntry)
            .filter(FuelEntry.vehicle_id == vehicle_id, FuelEntry.is_active == True)
            .order_by(desc(FuelEntry.fueling_date))
            .offset(skip)
            .limit(limit)
            .all()
        )

    def update_fuel_entry(
        self,
        entry_id: int,
        fuel_entry_update: FuelEntryUpdate,
        allow_odometer_decrease: bool = False,
    ) -> Optional[FuelEntry]:
        """Update a fuel entry."""
        db_fuel_entry = self.get_fuel_entry(entry_id)
        if not db_fuel_entry:
            return None

        update_data = fuel_entry_update.model_dump(exclude_unset=True)
        if "odometer_reading" in update_data and not allow_odometer_decrease:
            new_odometer = update_data["odometer_reading"]
            new_date = update_data.get("fueling_date", db_fuel_entry.fueling_date)
            if new_odometer < (db_fuel_entry.vehicle.initial_odometer or 0):
                raise ValueError(
                    f"Le kilométrage {new_odometer} km est inférieur au kilométrage initial "
                    f"du véhicule ({db_fuel_entry.vehicle.initial_odometer:g} km)"
                )
            previous = (
                self.db.query(FuelEntry)
                .filter(
                    FuelEntry.vehicle_id == db_fuel_entry.vehicle_id,
                    FuelEntry.id != entry_id,
                    FuelEntry.is_active == True,
                    FuelEntry.fueling_date < new_date,
                )
                .order_by(FuelEntry.odometer_reading.desc())
                .first()
            )
            following = (
                self.db.query(FuelEntry)
                .filter(
                    FuelEntry.vehicle_id == db_fuel_entry.vehicle_id,
                    FuelEntry.id != entry_id,
                    FuelEntry.is_active == True,
                    FuelEntry.fueling_date > new_date,
                )
                .order_by(FuelEntry.odometer_reading.asc())
                .first()
            )
            if previous and new_odometer < previous.odometer_reading:
                raise ValueError(
                    f"Le kilométrage {new_odometer} km est inférieur au relevé précédent "
                    f"({previous.odometer_reading} km)"
                )
            if following and new_odometer > following.odometer_reading:
                raise ValueError(
                    f"Le kilométrage {new_odometer} km est supérieur au relevé suivant "
                    f"({following.odometer_reading} km)"
                )

        # Recalculate total cost if liters or price_per_liter changed
        if "liters" in update_data or "price_per_liter" in update_data:
            new_liters = update_data.get("liters", db_fuel_entry.liters)
            new_price = update_data.get("price_per_liter", db_fuel_entry.price_per_liter)
            update_data["total_cost"] = new_liters * new_price
        
        for field, value in update_data.items():
            setattr(db_fuel_entry, field, value)
        
        self.db.commit()
        self.db.refresh(db_fuel_entry)
        return db_fuel_entry

    def delete_fuel_entry(self, entry_id: int) -> bool:
        """Soft-delete a fuel entry (sets is_active=False)"""
        db_fuel_entry = self.get_fuel_entry(entry_id)
        if not db_fuel_entry:
            return False

        db_fuel_entry.is_active = False
        self.db.commit()
        return True

    def get_distinct_station_names(self, vehicle_id: Optional[int] = None) -> List[str]:
        """Get distinct station names, optionally filtered by vehicle"""
        query = self.db.query(FuelEntry.station_name).filter(FuelEntry.station_name.isnot(None), FuelEntry.is_active == True)
        if vehicle_id is not None:
            query = query.filter(FuelEntry.vehicle_id == vehicle_id)
        results = query.distinct().order_by(FuelEntry.station_name).all()
        return [r.station_name for r in results]

    def get_nearest_station(self, vehicle_id: int, lat: float, lon: float, radius_m: float = 250) -> Optional[dict]:
        """Return station_name + location from the most recent past fill within radius_m metres."""
        from app.utils.calculations import haversine_m
        entries = (
            self.db.query(FuelEntry)
            .filter(
                FuelEntry.vehicle_id == vehicle_id,
                FuelEntry.is_active == True,
                FuelEntry.latitude.isnot(None),
                FuelEntry.longitude.isnot(None),
                FuelEntry.station_name.isnot(None),
            )
            .order_by(desc(FuelEntry.fueling_date), desc(FuelEntry.odometer_reading))
            .all()
        )
        for entry in entries:
            d = haversine_m(lat, lon, entry.latitude, entry.longitude)
            if d <= radius_m:
                return {"station_name": entry.station_name, "location": entry.location, "distance_m": round(d)}
        return None

    def get_latest_fuel_entry_by_vehicle(self, vehicle_id: int) -> Optional[FuelEntry]:
        """Get the latest fuel entry for a vehicle"""
        return (
            self.db.query(FuelEntry)
            .filter(FuelEntry.vehicle_id == vehicle_id, FuelEntry.is_active == True)
            .order_by(
                desc(FuelEntry.fueling_date),
                desc(FuelEntry.odometer_reading),
                desc(FuelEntry.is_full_tank),
                desc(FuelEntry.id),
            )
            .first()
        )

    def get_fuel_entries_count(
        self,
        vehicle_id: Optional[int] = None,
        fuel_type: Optional[FuelType] = None,
        start_date: Optional[date] = None,
        end_date: Optional[date] = None,
    ) -> int:
        """Get count of fuel entries with filters"""
        query = self.db.query(FuelEntry).filter(FuelEntry.is_active == True)

        if vehicle_id is not None:
            query = query.filter(FuelEntry.vehicle_id == vehicle_id)

        if fuel_type is not None:
            query = query.filter(FuelEntry.fuel_type == fuel_type)

        if start_date is not None:
            query = query.filter(FuelEntry.fueling_date >= start_date)

        if end_date is not None:
            query = query.filter(FuelEntry.fueling_date <= end_date)

        return query.count()

    def get_fuel_statistics_by_vehicle(self, vehicle_id: int) -> FuelStatisticsResponse:
        """Get fuel statistics for a vehicle.

        Average consumption is calculated only from full tank entries,
        with partial fills accumulating until the next full tank.
        """
        entries = (
            self.db.query(FuelEntry)
            .filter(FuelEntry.vehicle_id == vehicle_id, FuelEntry.is_active == True)
            # Same (date, odometer) = one FlexFuel stop. Partial (booster) before full
            # (top-up) so accumulation feeds the full's consumption calc, not the next one.
            .order_by(
                FuelEntry.fueling_date,
                FuelEntry.odometer_reading,
                FuelEntry.is_full_tank.asc(),
                FuelEntry.id,
            )
            .all()
        )

        if not entries:
            return FuelStatisticsResponse(
                total_entries=0,
                total_liters=0,
                total_cost=0,
                average_price_per_liter=0,
                total_distance=0,
                average_consumption=None,
            )

        total_liters = sum(entry.liters for entry in entries)
        total_cost = sum(entry.total_cost for entry in entries)

        # Calculate total distance (difference between first and last odometer reading)
        if len(entries) > 1:
            total_distance = entries[-1].odometer_reading - entries[0].odometer_reading
        else:
            total_distance = 0

        # Average consumption: distance-weighted over fill-to-fill segments
        # (Σ liters × 100 / Σ km) so a 600 km highway segment weighs
        # proportionally more than a 100 km city one. The anchor MUST be a full
        # tank — a partial can't anchor a segment because the tank state there
        # is unknown, so leading partials are excluded.
        average_consumption = None
        first_full_idx = next(
            (i for i, e in enumerate(entries) if getattr(e, 'is_full_tank', True)),
            None,
        )
        if first_full_idx is not None:
            last_full_tank_odometer = float(entries[first_full_idx].odometer_reading)
            accumulated_liters = 0.0
            segment_liters = 0.0
            segment_km = 0.0

            for entry in entries[first_full_idx + 1:]:
                accumulated_liters += entry.liters
                if getattr(entry, 'is_full_tank', True):
                    distance = float(entry.odometer_reading) - last_full_tank_odometer
                    if distance > 0:
                        segment_liters += accumulated_liters
                        segment_km += distance
                    last_full_tank_odometer = float(entry.odometer_reading)
                    accumulated_liters = 0.0

            if segment_km > 0:
                average_consumption = round(segment_liters * 100 / segment_km, 2)

        return FuelStatisticsResponse(
            total_entries=len(entries),
            total_liters=round(total_liters, 2),
            total_cost=round(total_cost, 2),
            average_price_per_liter=round(total_cost / total_liters if total_liters > 0 else 0, 2),
            total_distance=total_distance,
            average_consumption=average_consumption,
        )

    def get_consumption_history(self, vehicle_id: int) -> dict:
        """Get consumption history for a vehicle with calculated L/100km for each fill-up.

        Consumption is only calculated for full tank entries. Partial fills accumulate
        their liters until the next full tank, which then calculates average consumption
        over the entire distance since the last full tank.
        """
        entries = (
            self.db.query(FuelEntry)
            .filter(FuelEntry.vehicle_id == vehicle_id, FuelEntry.is_active == True)
            # Same (date, odometer) = one FlexFuel stop. Partial (booster) before full
            # (top-up) so accumulation feeds the full's consumption calc, not the next one.
            .order_by(
                FuelEntry.fueling_date,
                FuelEntry.odometer_reading,
                FuelEntry.is_full_tank.asc(),
                FuelEntry.id,
            )
            .all()
        )

        if not entries:
            return {
                "vehicle_id": vehicle_id,
                "data_points": []
            }

        data_points = []

        # Track accumulated liters from partial fills (total + E85 portion)
        accumulated_liters = 0.0
        accumulated_e85_liters = 0.0
        # Track the odometer reading of the last full tank (segment anchor)
        last_full_tank_odometer = None
        # E85 fraction of the fuel ADDED at the previous Plein. That's what was
        # in the tank during the *current* segment, i.e. what got burned and
        # produced the measured consumption — so it's the correct fraction to
        # attribute to this segment's data point.
        prev_added_e85_frac: Optional[float] = None

        def _e85_l(e) -> float:
            return float(e.liters) if getattr(e, "fuel_type", None) == FuelType.E85 else 0.0

        for i, entry in enumerate(entries):
            is_full = getattr(entry, 'is_full_tank', True)  # Default to True for old entries

            if last_full_tank_odometer is None:
                # No full-tank anchor yet — display-only points. A partial can't
                # anchor a segment (tank state unknown), so its liters must NOT
                # feed the first real segment.
                data_points.append({
                    "date": entry.fueling_date,
                    "consumption": None,
                    "odometer_reading": entry.odometer_reading,
                    "liters": entry.liters,
                    "distance": None,
                    "is_full_tank": is_full,
                    "e85_fraction": None,
                })
                if is_full:
                    last_full_tank_odometer = entry.odometer_reading
                    accumulated_liters = 0.0
                    accumulated_e85_liters = 0.0
                    # The very first Plein established a tank composition,
                    # which will be burned during the next segment.
                    prev_added_e85_frac = (
                        1.0 if entry.fuel_type == FuelType.E85 else 0.0
                    )
            else:
                if is_full:
                    # Full tank - calculate consumption using accumulated liters + current liters
                    total_liters = accumulated_liters + entry.liters
                    total_e85_liters = accumulated_e85_liters + _e85_l(entry)
                    added_e85_frac = (
                        total_e85_liters / total_liters if total_liters > 0 else None
                    )

                    distance = entry.odometer_reading - last_full_tank_odometer

                    if distance > 0:
                        consumption = round((total_liters * 100) / distance, 2)
                    else:
                        consumption = None
                        distance = None

                    # Attribute the segment to the PREVIOUS Plein's composition
                    # (what was actually burned), not the fuel just added.
                    data_points.append({
                        "date": entry.fueling_date,
                        "consumption": consumption,
                        "odometer_reading": entry.odometer_reading,
                        "liters": round(total_liters, 2),
                        "distance": distance,
                        "is_full_tank": True,
                        "e85_fraction": (
                            round(prev_added_e85_frac, 4)
                            if prev_added_e85_frac is not None
                            else None
                        ),
                    })

                    # Reset for next segment; remember what we added so the
                    # next segment attributes correctly.
                    last_full_tank_odometer = entry.odometer_reading
                    accumulated_liters = 0.0
                    accumulated_e85_liters = 0.0
                    prev_added_e85_frac = added_e85_frac
                else:
                    # Partial fill - accumulate liters, no consumption calculation
                    accumulated_liters += entry.liters
                    accumulated_e85_liters += _e85_l(entry)

                    # Calculate distance from last entry for display
                    previous_entry = entries[i - 1]
                    distance = entry.odometer_reading - previous_entry.odometer_reading

                    data_points.append({
                        "date": entry.fueling_date,
                        "consumption": None,  # No consumption for partial fills
                        "odometer_reading": entry.odometer_reading,
                        "liters": entry.liters,
                        "distance": distance if distance > 0 else None,
                        "is_full_tank": False,
                        "e85_fraction": None,
                    })

        return {
            "vehicle_id": vehicle_id,
            "data_points": data_points
        }
