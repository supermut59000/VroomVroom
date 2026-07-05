from typing import List, Optional
from sqlalchemy.orm import Session
from sqlalchemy import and_, desc, asc
from app.models.maintenance import Maintenance
from app.schemas.maintenance import MaintenanceCreate, MaintenanceUpdate
from datetime import date, datetime


class MaintenanceService:
    def __init__(self, db: Session):
        self.db = db

    def _assert_vehicle_exists(self, vehicle_id: int):
        from app.models.vehicle import Vehicle
        vehicle = self.db.query(Vehicle).filter(Vehicle.id == vehicle_id).first()
        if not vehicle:
            raise ValueError(f"Véhicule avec l'id {vehicle_id} introuvable")
        return vehicle

    def create_maintenance(self, maintenance: MaintenanceCreate) -> Maintenance:
        """Create a new maintenance entry"""
        vehicle = self._assert_vehicle_exists(maintenance.vehicle_id)

        # Maintenance odometer feeds the cost-spreading math — reject readings
        # below the vehicle's initial odometer (obvious typo)
        if maintenance.odometer_reading < (vehicle.initial_odometer or 0):
            raise ValueError(
                f"Le kilométrage {maintenance.odometer_reading} km est inférieur "
                f"au kilométrage initial du véhicule ({vehicle.initial_odometer:g} km)"
            )

        db_maintenance = Maintenance(
            vehicle_id=maintenance.vehicle_id,
            maintenance_type=maintenance.maintenance_type,
            description=maintenance.description,
            cost=maintenance.cost,
            odometer_reading=maintenance.odometer_reading,
            service_provider=maintenance.service_provider,
            location=maintenance.location,
            maintenance_date=maintenance.maintenance_date,
            notes=maintenance.notes,
            next_maintenance_date=maintenance.next_maintenance_date,
            next_maintenance_odometer=maintenance.next_maintenance_odometer,
        )

        self.db.add(db_maintenance)
        self.db.commit()
        self.db.refresh(db_maintenance)
        return db_maintenance

    def get_maintenance(self, maintenance_id: int) -> Optional[Maintenance]:
        """Get a maintenance entry by ID"""
        return self.db.query(Maintenance).filter(Maintenance.id == maintenance_id, Maintenance.is_active == True).first()

    def get_maintenances(
        self,
        vehicle_id: Optional[int] = None,
        maintenance_type: Optional[str] = None,
        start_date: Optional[date] = None,
        end_date: Optional[date] = None,
        skip: int = 0,
        limit: int = 100,
        order_by: str = "maintenance_date",
        order: str = "desc"
    ) -> List[Maintenance]:
        """Get maintenance entries with optional filters"""
        query = self.db.query(Maintenance).filter(Maintenance.is_active == True)

        # Apply filters
        if vehicle_id:
            query = query.filter(Maintenance.vehicle_id == vehicle_id)

        if maintenance_type:
            query = query.filter(Maintenance.maintenance_type == maintenance_type)

        if start_date:
            query = query.filter(Maintenance.maintenance_date >= start_date)

        if end_date:
            query = query.filter(Maintenance.maintenance_date <= end_date)

        # Apply ordering
        order_column = getattr(Maintenance, order_by, Maintenance.maintenance_date)
        if order.lower() == "asc":
            query = query.order_by(asc(order_column))
        else:
            query = query.order_by(desc(order_column))

        return query.offset(skip).limit(limit).all()

    def get_maintenances_by_vehicle(
        self,
        vehicle_id: int,
        skip: int = 0,
        limit: int = 100
    ) -> List[Maintenance]:
        """Get all maintenance entries for a specific vehicle"""
        return (
            self.db.query(Maintenance)
            .filter(Maintenance.vehicle_id == vehicle_id, Maintenance.is_active == True)
            .order_by(desc(Maintenance.maintenance_date))
            .offset(skip)
            .limit(limit)
            .all()
        )

    def update_maintenance(
        self,
        maintenance_id: int,
        maintenance_update: MaintenanceUpdate
    ) -> Optional[Maintenance]:
        """Update a maintenance entry"""
        db_maintenance = self.get_maintenance(maintenance_id)
        if not db_maintenance:
            return None

        # Update fields
        update_data = maintenance_update.model_dump(exclude_unset=True)

        for field, value in update_data.items():
            setattr(db_maintenance, field, value)

        self.db.commit()
        self.db.refresh(db_maintenance)
        return db_maintenance

    def delete_maintenance(self, maintenance_id: int) -> bool:
        """Soft-delete a maintenance entry (sets is_active=False)"""
        db_maintenance = self.get_maintenance(maintenance_id)
        if not db_maintenance:
            return False

        db_maintenance.is_active = False
        self.db.commit()
        return True

    def get_latest_maintenance_by_vehicle(self, vehicle_id: int) -> Optional[Maintenance]:
        """Get the latest maintenance entry for a vehicle"""
        return (
            self.db.query(Maintenance)
            .filter(Maintenance.vehicle_id == vehicle_id, Maintenance.is_active == True)
            .order_by(desc(Maintenance.maintenance_date), desc(Maintenance.odometer_reading))
            .first()
        )

    def get_maintenances_count(
        self,
        vehicle_id: Optional[int] = None,
        maintenance_type: Optional[str] = None,
        start_date: Optional[date] = None,
        end_date: Optional[date] = None,
    ) -> int:
        """Get count of maintenance entries with filters"""
        query = self.db.query(Maintenance).filter(Maintenance.is_active == True)

        if vehicle_id:
            query = query.filter(Maintenance.vehicle_id == vehicle_id)

        if maintenance_type:
            query = query.filter(Maintenance.maintenance_type == maintenance_type)

        if start_date:
            query = query.filter(Maintenance.maintenance_date >= start_date)

        if end_date:
            query = query.filter(Maintenance.maintenance_date <= end_date)

        return query.count()

    def get_maintenance_statistics_by_vehicle(self, vehicle_id: int) -> dict:
        """Get maintenance statistics for a vehicle"""
        entries = (
            self.db.query(Maintenance)
            .filter(Maintenance.vehicle_id == vehicle_id, Maintenance.is_active == True)
            .order_by(Maintenance.maintenance_date)
            .all()
        )

        if not entries:
            return {
                "total_entries": 0,
                "total_cost": 0,
                "average_cost": 0,
                "last_maintenance_date": None,
                "next_maintenance_date": None,
            }

        total_cost = sum(entry.cost for entry in entries)
        last_entry = entries[-1]

        # Next due date: only the latest entry per maintenance type counts —
        # an older vidange's next date is superseded by the newer vidange.
        latest_by_type: dict = {}
        for entry in entries:  # sorted by maintenance_date ASC
            latest_by_type[entry.maintenance_type] = entry
        next_dates = [
            e.next_maintenance_date
            for e in latest_by_type.values()
            if e.next_maintenance_date
        ]
        next_maintenance_date = min(next_dates) if next_dates else None

        return {
            "total_entries": len(entries),
            "total_cost": round(total_cost, 2),
            "average_cost": round(total_cost / len(entries), 2),
            "last_maintenance_date": last_entry.maintenance_date,
            "next_maintenance_date": next_maintenance_date,
        }
