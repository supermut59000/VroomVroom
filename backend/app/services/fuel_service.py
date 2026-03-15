from typing import List, Optional
from sqlalchemy.orm import Session
from sqlalchemy import and_, desc, asc
from app.models.fuel_entry import FuelEntry
from app.core.enums import FuelType
from app.schemas.fuel_entry import FuelEntryCreate, FuelEntryUpdate
from datetime import date, datetime


class FuelService:
    def __init__(self, db: Session):
        self.db = db

    def create_fuel_entry(self, fuel_entry: FuelEntryCreate) -> FuelEntry:
        """Create a new fuel entry"""
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
        )
        
        self.db.add(db_fuel_entry)
        self.db.commit()
        self.db.refresh(db_fuel_entry)
        return db_fuel_entry

    def get_fuel_entry(self, entry_id: int) -> Optional[FuelEntry]:
        """Get a fuel entry by ID"""
        return self.db.query(FuelEntry).filter(FuelEntry.id == entry_id).first()

    def get_fuel_entries(
        self,
        vehicle_id: Optional[str] = None,
        fuel_type: Optional[FuelType] = None,
        start_date: Optional[date] = None,
        end_date: Optional[date] = None,
        skip: int = 0,
        limit: int = 100,
        order_by: str = "fueling_date",
        order: str = "desc"
    ) -> List[FuelEntry]:
        """Get fuel entries with optional filters"""
        query = self.db.query(FuelEntry)
        
        # Apply filters
        if vehicle_id:
            query = query.filter(FuelEntry.vehicle_id == vehicle_id)
        
        if fuel_type:
            query = query.filter(FuelEntry.fuel_type == fuel_type)
        
        if start_date:
            query = query.filter(FuelEntry.fueling_date >= start_date)
        
        if end_date:
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
            .filter(FuelEntry.vehicle_id == vehicle_id)
            .order_by(desc(FuelEntry.fueling_date))
            .offset(skip)
            .limit(limit)
            .all()
        )

    def update_fuel_entry(
        self, 
        entry_id: int, 
        fuel_entry_update: FuelEntryUpdate
    ) -> Optional[FuelEntry]:
        """Update a fuel entry"""
        db_fuel_entry = self.get_fuel_entry(entry_id)
        if not db_fuel_entry:
            return None
        
        # Update fields
        update_data = fuel_entry_update.dict(exclude_unset=True)
        
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
        """Delete a fuel entry"""
        db_fuel_entry = self.get_fuel_entry(entry_id)
        if not db_fuel_entry:
            return False
        
        self.db.delete(db_fuel_entry)
        self.db.commit()
        return True

    def get_distinct_station_names(self, vehicle_id: Optional[str] = None) -> List[str]:
        """Get distinct station names, optionally filtered by vehicle"""
        query = self.db.query(FuelEntry.station_name).filter(FuelEntry.station_name.isnot(None))
        if vehicle_id:
            query = query.filter(FuelEntry.vehicle_id == vehicle_id)
        results = query.distinct().order_by(FuelEntry.station_name).all()
        return [r.station_name for r in results]

    def get_latest_fuel_entry_by_vehicle(self, vehicle_id: int) -> Optional[FuelEntry]:
        """Get the latest fuel entry for a vehicle"""
        return (
            self.db.query(FuelEntry)
            .filter(FuelEntry.vehicle_id == vehicle_id)
            .order_by(desc(FuelEntry.fueling_date), desc(FuelEntry.odometer_reading))
            .first()
        )

    def get_fuel_entries_count(
        self,
        vehicle_id: Optional[str] = None,
        fuel_type: Optional[FuelType] = None,
        start_date: Optional[date] = None,
        end_date: Optional[date] = None,
    ) -> int:
        """Get count of fuel entries with filters"""
        query = self.db.query(FuelEntry)
        
        if vehicle_id:
            query = query.filter(FuelEntry.vehicle_id == vehicle_id)
        
        if fuel_type:
            query = query.filter(FuelEntry.fuel_type == fuel_type)
        
        if start_date:
            query = query.filter(FuelEntry.fueling_date >= start_date)
        
        if end_date:
            query = query.filter(FuelEntry.fueling_date <= end_date)
        
        return query.count()

    def get_fuel_statistics_by_vehicle(self, vehicle_id: int) -> dict:
        """Get fuel statistics for a vehicle.

        Average consumption is calculated only from full tank entries,
        with partial fills accumulating until the next full tank.
        """
        entries = (
            self.db.query(FuelEntry)
            .filter(FuelEntry.vehicle_id == vehicle_id)
            .order_by(FuelEntry.odometer_reading)
            .all()
        )

        if not entries:
            return {
                "total_entries": 0,
                "total_liters": 0,
                "total_cost": 0,
                "average_price_per_liter": 0,
                "total_distance": 0,
                "average_consumption": None,
            }

        total_liters = sum(entry.liters for entry in entries)
        total_cost = sum(entry.total_cost for entry in entries)

        # Calculate total distance (difference between first and last odometer reading)
        if len(entries) > 1:
            total_distance = entries[-1].odometer_reading - entries[0].odometer_reading
        else:
            total_distance = 0

        # Calculate average consumption with proper partial fill handling
        average_consumption = None
        if len(entries) > 1:
            accumulated_liters = 0.0
            last_full_tank_odometer = None
            consumption_values = []

            for i, entry in enumerate(entries):
                is_full = getattr(entry, 'is_full_tank', True)  # Default to True for old entries

                if i == 0:
                    # First entry - set reference point
                    if is_full:
                        last_full_tank_odometer = float(entry.odometer_reading)
                        accumulated_liters = 0.0
                    else:
                        # First entry is partial, start accumulating
                        last_full_tank_odometer = float(entry.odometer_reading)
                        accumulated_liters = entry.liters
                else:
                    if is_full:
                        # Full tank - calculate consumption
                        total_liters_for_calc = accumulated_liters + entry.liters

                        if last_full_tank_odometer is not None:
                            distance = float(entry.odometer_reading) - last_full_tank_odometer

                            if distance > 0:
                                consumption = (total_liters_for_calc * 100) / distance
                                consumption_values.append(consumption)

                        # Reset for next calculation
                        last_full_tank_odometer = float(entry.odometer_reading)
                        accumulated_liters = 0.0
                    else:
                        # Partial fill - just accumulate liters
                        accumulated_liters += entry.liters

            # Calculate average from all valid consumption values
            if consumption_values:
                average_consumption = round(sum(consumption_values) / len(consumption_values), 2)

        return {
            "total_entries": len(entries),
            "total_liters": round(total_liters, 2),
            "total_cost": round(total_cost, 2),
            "average_price_per_liter": round(total_cost / total_liters if total_liters > 0 else 0, 2),
            "total_distance": total_distance,
            "average_consumption": average_consumption,
        }

    def get_consumption_history(self, vehicle_id: int) -> dict:
        """Get consumption history for a vehicle with calculated L/100km for each fill-up.

        Consumption is only calculated for full tank entries. Partial fills accumulate
        their liters until the next full tank, which then calculates average consumption
        over the entire distance since the last full tank.
        """
        entries = (
            self.db.query(FuelEntry)
            .filter(FuelEntry.vehicle_id == vehicle_id)
            .order_by(FuelEntry.fueling_date, FuelEntry.odometer_reading)
            .all()
        )

        if not entries:
            return {
                "vehicle_id": vehicle_id,
                "data_points": []
            }

        data_points = []

        # Track accumulated liters from partial fills
        accumulated_liters = 0.0
        # Track the odometer reading of the last full tank (or first entry)
        last_full_tank_odometer = None

        for i, entry in enumerate(entries):
            is_full = getattr(entry, 'is_full_tank', True)  # Default to True for old entries

            if i == 0:
                # First entry - no consumption calculation possible
                data_points.append({
                    "date": entry.fueling_date,
                    "consumption": None,
                    "odometer_reading": entry.odometer_reading,
                    "liters": entry.liters,
                    "distance": None,
                    "is_full_tank": is_full
                })
                if is_full:
                    last_full_tank_odometer = entry.odometer_reading
                    accumulated_liters = 0.0
                else:
                    # First entry is partial, start accumulating
                    last_full_tank_odometer = entry.odometer_reading
                    accumulated_liters = entry.liters
            else:
                if is_full:
                    # Full tank - calculate consumption using accumulated liters + current liters
                    total_liters = accumulated_liters + entry.liters

                    if last_full_tank_odometer is not None:
                        distance = entry.odometer_reading - last_full_tank_odometer

                        if distance > 0:
                            consumption = round((total_liters * 100) / distance, 2)
                        else:
                            consumption = None
                            distance = None
                    else:
                        distance = None
                        consumption = None

                    data_points.append({
                        "date": entry.fueling_date,
                        "consumption": consumption,
                        "odometer_reading": entry.odometer_reading,
                        "liters": entry.liters,
                        "distance": distance,
                        "is_full_tank": True
                    })

                    # Reset for next calculation
                    last_full_tank_odometer = entry.odometer_reading
                    accumulated_liters = 0.0
                else:
                    # Partial fill - accumulate liters, no consumption calculation
                    accumulated_liters += entry.liters

                    # Calculate distance from last entry for display
                    previous_entry = entries[i - 1]
                    distance = entry.odometer_reading - previous_entry.odometer_reading

                    data_points.append({
                        "date": entry.fueling_date,
                        "consumption": None,  # No consumption for partial fills
                        "odometer_reading": entry.odometer_reading,
                        "liters": entry.liters,
                        "distance": distance if distance > 0 else None,
                        "is_full_tank": False
                    })

        return {
            "vehicle_id": vehicle_id,
            "data_points": data_points
        }
