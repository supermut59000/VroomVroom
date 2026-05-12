from typing import Optional, List
from datetime import date
from collections import defaultdict
from sqlalchemy.orm import Session
from sqlalchemy import desc

from app.models.flexfuel_conversion import FlexfuelConversion
from app.models.e10_reference_price import E10ReferencePrice
from app.models.fuel_entry import FuelEntry
from app.core.enums import FuelType
from app.schemas.flexfuel import (
    FlexfuelConversionCreate,
    FlexfuelConversionUpdate,
    E10ReferencePriceCreate,
    E10ReferencePriceUpdate,
)


class FlexfuelService:
    def __init__(self, db: Session):
        self.db = db

    def _assert_vehicle_exists(self, vehicle_id: int) -> None:
        from app.models.vehicle import Vehicle
        if not self.db.query(Vehicle).filter(Vehicle.id == vehicle_id).first():
            raise ValueError(f"Véhicule avec l'id {vehicle_id} introuvable")

    # ---- Conversion CRUD ----

    def create_conversion(self, data: FlexfuelConversionCreate) -> FlexfuelConversion:
        self._assert_vehicle_exists(data.vehicle_id)

        conversion = FlexfuelConversion(
            vehicle_id=data.vehicle_id,
            conversion_date=data.conversion_date,
            kit_cost=data.kit_cost,
            overconsumption_pct=data.overconsumption_pct,
            kit_brand=data.kit_brand,
            installer=data.installer,
            notes=data.notes,
        )
        self.db.add(conversion)
        self.db.commit()
        self.db.refresh(conversion)
        return conversion

    def get_conversion(self, vehicle_id: int) -> Optional[FlexfuelConversion]:
        return (
            self.db.query(FlexfuelConversion)
            .filter(FlexfuelConversion.vehicle_id == vehicle_id, FlexfuelConversion.is_active == True)
            .first()
        )

    def update_conversion(self, vehicle_id: int, data: FlexfuelConversionUpdate) -> Optional[FlexfuelConversion]:
        conversion = self.get_conversion(vehicle_id)
        if not conversion:
            return None
        update_data = data.model_dump(exclude_unset=True)
        for field, value in update_data.items():
            setattr(conversion, field, value)
        self.db.commit()
        self.db.refresh(conversion)
        return conversion

    def delete_conversion(self, vehicle_id: int) -> bool:
        conversion = self.get_conversion(vehicle_id)
        if not conversion:
            return False
        conversion.is_active = False
        self.db.commit()
        return True

    # ---- E10 Reference Price CRUD ----

    def create_e10_price(self, data: E10ReferencePriceCreate) -> E10ReferencePrice:
        price = E10ReferencePrice(
            reference_date=data.reference_date,
            price_per_liter=data.price_per_liter,
            notes=data.notes,
        )
        self.db.add(price)
        self.db.commit()
        self.db.refresh(price)
        return price

    def get_e10_prices(self) -> List[E10ReferencePrice]:
        return (
            self.db.query(E10ReferencePrice)
            .filter(E10ReferencePrice.is_active == True)
            .order_by(desc(E10ReferencePrice.reference_date))
            .all()
        )

    def update_e10_price(self, price_id: int, data: E10ReferencePriceUpdate) -> Optional[E10ReferencePrice]:
        price = self.db.query(E10ReferencePrice).filter(
            E10ReferencePrice.id == price_id, E10ReferencePrice.is_active == True
        ).first()
        if not price:
            return None
        update_data = data.model_dump(exclude_unset=True)
        for field, value in update_data.items():
            setattr(price, field, value)
        self.db.commit()
        self.db.refresh(price)
        return price

    def delete_e10_price(self, price_id: int) -> bool:
        price = self.db.query(E10ReferencePrice).filter(
            E10ReferencePrice.id == price_id, E10ReferencePrice.is_active == True
        ).first()
        if not price:
            return False
        price.is_active = False
        self.db.commit()
        return True

    def get_latest_e10_price_at_date(self, target_date: date) -> Optional[float]:
        """Get the most recent E10 reference price on or before target_date."""
        price = (
            self.db.query(E10ReferencePrice)
            .filter(E10ReferencePrice.reference_date <= target_date, E10ReferencePrice.is_active == True)
            .order_by(desc(E10ReferencePrice.reference_date))
            .first()
        )
        return price.price_per_liter if price else None

    # ---- Rentability Calculation ----

    def calculate_rentability(self, vehicle_id: int) -> Optional[dict]:
        conversion = self.get_conversion(vehicle_id)
        if not conversion:
            return None

        # Get all E85 fuel entries after conversion date
        e85_entries = (
            self.db.query(FuelEntry)
            .filter(
                FuelEntry.vehicle_id == vehicle_id,
                FuelEntry.fuel_type == FuelType.E85,
                FuelEntry.fueling_date >= conversion.conversion_date,
            )
            .order_by(FuelEntry.fueling_date, FuelEntry.odometer_reading)
            .all()
        )

        overconsumption_factor = 1 + (conversion.overconsumption_pct / 100)
        cumulative_savings = 0.0
        data_points = []
        monthly_map = defaultdict(float)
        break_even_date = None
        skipped_fills_no_e10_price = 0

        for entry in e85_entries:
            e10_ref_price = self.get_latest_e10_price_at_date(entry.fueling_date)
            if e10_ref_price is None:
                skipped_fills_no_e10_price += 1
                continue  # Skip fills with no E10 reference price

            equivalent_e10_liters = entry.liters / overconsumption_factor
            e10_equivalent_cost = equivalent_e10_liters * e10_ref_price
            actual_e85_cost = entry.total_cost
            savings = e10_equivalent_cost - actual_e85_cost
            cumulative_savings += savings

            if break_even_date is None and cumulative_savings >= conversion.kit_cost:
                break_even_date = entry.fueling_date

            month_key = entry.fueling_date.strftime("%Y-%m")
            monthly_map[month_key] += savings

            data_points.append({
                "date": entry.fueling_date,
                "e85_liters": round(entry.liters, 2),
                "e85_cost": round(actual_e85_cost, 2),
                "equivalent_e10_liters": round(equivalent_e10_liters, 2),
                "e10_reference_price": round(e10_ref_price, 3),
                "e10_equivalent_cost": round(e10_equivalent_cost, 2),
                "savings": round(savings, 2),
                "cumulative_savings": round(cumulative_savings, 2),
            })

        # Build monthly savings list sorted by month
        monthly_savings = [
            {"month": month, "savings": round(savings, 2)}
            for month, savings in sorted(monthly_map.items())
        ]

        current_month = date.today().strftime("%Y-%m")
        completed_months = [m["savings"] for m in monthly_savings if m["month"] < current_month]
        monthly_avg = round(sum(completed_months) / len(completed_months), 2) if completed_months else None

        return {
            "vehicle_id": vehicle_id,
            "kit_cost": conversion.kit_cost,
            "overconsumption_pct": conversion.overconsumption_pct,
            "conversion_date": conversion.conversion_date,
            "total_e85_fills": len(data_points),
            "total_savings": round(cumulative_savings, 2),
            "break_even_reached": cumulative_savings >= conversion.kit_cost,
            "break_even_date": break_even_date,
            "monthly_average_savings": monthly_avg,
            "skipped_fills_no_e10_price": skipped_fills_no_e10_price,
            "data_points": data_points,
            "monthly_savings": monthly_savings,
        }
