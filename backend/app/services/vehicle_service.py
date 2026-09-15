from typing import List, Optional
from sqlalchemy.orm import Session
from sqlalchemy import and_, desc, func
from datetime import datetime, date

from app.models.vehicle import Vehicle
from app.models.fuel_entry import FuelEntry
from app.models.maintenance import Maintenance
from app.models.flexfuel_conversion import FlexfuelConversion

from app.schemas.vehicle import (
    VehicleCreate,
    VehicleUpdate,
    VehicleStats,
    SeasonStats,
    VehicleTimeline,
    VehicleTimelineEvent,
    VehiclePeriodStats,
    FuelTypePeriodBreakdown,
)
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
        
        if fuel_type is not None:
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
        db_vehicle = Vehicle(**vehicle_data.model_dump())
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
        update_data = vehicle_data.model_dump(exclude_unset=True)
        required = {"brand", "model", "year", "license_plate", "fuel_type", "initial_odometer", "is_active"}
        if any(update_data.get(field) is None for field in required & update_data.keys()):
            raise ValueError("Les champs obligatoires du véhicule ne peuvent pas être nuls")

        if "initial_odometer" in update_data:
            readings = [
                self.db.query(func.min(FuelEntry.odometer_reading)).filter(
                    FuelEntry.vehicle_id == vehicle_id,
                    FuelEntry.is_active == True,
                ).scalar(),
                self.db.query(func.min(Maintenance.odometer_reading)).filter(
                    Maintenance.vehicle_id == vehicle_id,
                    Maintenance.is_active == True,
                ).scalar(),
            ]
            first_reading = min(value for value in readings if value is not None) if any(
                value is not None for value in readings
            ) else None
            if first_reading is not None and update_data["initial_odometer"] > first_reading:
                raise ValueError(
                    f"Le kilométrage initial ne peut pas dépasser le premier relevé ({first_reading:g} km)"
                )

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
        Returns None when unlimited or when required fields are missing.
        """
        if vehicle.insurance_unlimited:
            return None
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

        # A start date in the future must not shrink the limit
        years_elapsed = max(0, years_elapsed)

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

    def _compute_seasonal_consumption(
        self,
        vehicle_id: int,
        overconsumption_pct: Optional[float],
        tank_capacity: Optional[float],
        from_date: Optional[date] = None,
    ) -> dict:
        """
        Compute per-season consumption stats using the fill-to-fill method.

        Seasons (by full-tank fill date):
          Printemps: mars-mai (3-5)
          Été:       juin-août (6-8)
          Automne:   sept-nov (9-11)
          Hiver:     déc-fév (12, 1, 2)

        avg_consumption uses a distance-weighted mean (total_liters / total_km × 100)
        so that a 400 km highway segment is not flattened by a 100 km city segment.

        min/max_consumption track the per-segment extremes to expose the spread
        between best (highway) and worst (city-only) conditions.

        For FlexFuel vehicles, per-segment normalisation before distance-weighted
        averaging gives accurate E10 and E85 baselines even with a mixed history.

        Returns a dict {season: SeasonStats} for all four seasons.
        """
        CUSHION_L = 5.0

        query = self.db.query(FuelEntry).filter(
            FuelEntry.vehicle_id == vehicle_id, FuelEntry.is_active == True
        )
        if from_date is not None:
            # FlexFuel: ignore pre-conversion fills so the season's E85/E10 mix
            # isn't biased by all-Essence segments from before the conversion.
            query = query.filter(FuelEntry.fueling_date >= from_date)
        entries = query.order_by(
            # Same (date, odometer) = one FlexFuel stop. Partial (booster) before full
            # (top-up) so accumulation feeds the full's consumption calc, not the next one.
            FuelEntry.fueling_date,
            FuelEntry.odometer_reading,
            FuelEntry.is_full_tank.asc(),
            FuelEntry.id,
        ).all()

        if entries:
            # The anchor for fill-to-fill MUST be a full tank, otherwise the first
            # computed segment uses an artificially short distance (partial → next
            # Plein) but counts liters whose burn window is unknown. Drop
            # everything until the first full tank (on/after from_date when set).
            first_full_idx = next(
                (i for i, e in enumerate(entries) if getattr(e, "is_full_tank", True)),
                None,
            )
            entries = entries[first_full_idx:] if first_full_idx is not None else []

        def month_to_season(month: int) -> str:
            if month in (3, 4, 5):
                return "spring"
            if month in (6, 7, 8):
                return "summer"
            if month in (9, 10, 11):
                return "autumn"
            return "winter"

        # Each bucket entry: (distance_km, liters, e85_burned_liters, measured_l100)
        # e85_burned_liters reflects what was burned during the segment (i.e. the
        # composition added at the PREVIOUS Plein), not what was poured at the
        # closing Plein. This is the user's "what fuel did I actually use?".
        season_buckets: dict[str, list[tuple[float, float, float, float]]] = {
            "spring": [], "summer": [], "autumn": [], "winter": []
        }

        accumulated_liters = 0.0
        accumulated_e85_liters = 0.0
        last_full_tank_odometer: Optional[float] = None
        # Fraction of E85 in fuel added at the previous Plein — that's what
        # was in the tank during the current segment, i.e. what got burned.
        prev_added_e85_frac: Optional[float] = None

        for i, entry in enumerate(entries):
            is_full = getattr(entry, "is_full_tank", True)
            is_e85 = entry.fuel_type == FuelType.E85

            if i == 0:
                last_full_tank_odometer = float(entry.odometer_reading)
                # entries[0] is always a Plein: the history was truncated at the
                # first full tank above (anchor-less leading partials excluded).
                accumulated_liters = 0.0
                accumulated_e85_liters = 0.0
                # The first Plein establishes a tank composition for the
                # first usable segment.
                prev_added_e85_frac = 1.0 if is_e85 else 0.0
                continue

            if is_full:
                seg_liters = accumulated_liters + entry.liters
                added_e85 = accumulated_e85_liters + (entry.liters if is_e85 else 0.0)
                added_e85_frac = added_e85 / seg_liters if seg_liters > 0 else None

                if (
                    last_full_tank_odometer is not None
                    and seg_liters > 0
                    and prev_added_e85_frac is not None
                ):
                    distance = float(entry.odometer_reading) - last_full_tank_odometer
                    if distance > 0:
                        measured = (seg_liters * 100) / distance
                        season = month_to_season(entry.fueling_date.month)
                        # Liters of E85 burned = seg_liters × previous-Plein fraction
                        e85_burned = seg_liters * prev_added_e85_frac
                        season_buckets[season].append(
                            (distance, seg_liters, e85_burned, measured)
                        )

                last_full_tank_odometer = float(entry.odometer_reading)
                accumulated_liters = 0.0
                accumulated_e85_liters = 0.0
                prev_added_e85_frac = added_e85_frac
            else:
                accumulated_liters += entry.liters
                if is_e85:
                    accumulated_e85_liters += entry.liters

        def _range(conso: Optional[float]) -> Optional[float]:
            if conso and conso > 0 and tank_capacity:
                return round(max(0.0, tank_capacity - CUSHION_L) * 100 / conso, 0)
            return None

        result: dict[str, SeasonStats] = {}
        opc = overconsumption_pct / 100 if overconsumption_pct is not None else None

        for season, data_points in season_buckets.items():
            if not data_points:
                result[season] = SeasonStats(fill_count=0)
                continue

            total_km = sum(d for d, _, _, _ in data_points)
            total_liters = sum(l for _, l, _, _ in data_points)
            total_e85_liters = sum(e for _, _, e, _ in data_points)

            # Distance-weighted average: long segments matter proportionally more
            avg_measured = (total_liters * 100) / total_km
            avg_e85_frac = total_e85_liters / total_liters

            # Min/max raw measured — same metric as the line chart's points
            min_conso = round(min(m for _, _, _, m in data_points), 2)
            max_conso = round(max(m for _, _, _, m in data_points), 2)

            # Per-segment NORMALISATION → "what if pure E10 / pure E85" projection.
            # For each segment: e10 = measured / (1 + opc × e85_fraction_of_segment).
            # Then distance-weighted average across all season segments.
            # This is the answer to "if I filled with pure X, what would my
            # consumption be?" — different from the chart's raw-measured split.
            e10_consumption: Optional[float] = None
            e85_consumption: Optional[float] = None
            if opc is not None:
                e10_per_seg = [m / (1 + opc * (e / l)) for _, l, e, m in data_points]
                e10_consumption = round(
                    sum((d / total_km) * v for (d, _, _, _), v in zip(data_points, e10_per_seg)),
                    2,
                )
                e85_consumption = round(e10_consumption * (1 + opc), 2)

            result[season] = SeasonStats(
                avg_consumption=round(avg_measured, 2),
                min_consumption=min_conso,
                max_consumption=max_conso,
                e85_fraction=round(avg_e85_frac, 3),
                e10_consumption=e10_consumption,
                e85_consumption=e85_consumption,
                range_km=_range(avg_measured),
                range_km_best=_range(min_conso),
                range_km_worst=_range(max_conso),
                range_km_e10=_range(e10_consumption),
                range_km_e85=_range(e85_consumption),
                fill_count=len(data_points),
            )

        return result

    def get_period_stats(self, vehicle_id: int, start_date: date, end_date: date) -> VehiclePeriodStats:
        """Bilan entre deux dates: km, consommation, coûts, économies E85."""
        vehicle = self.get_vehicle(vehicle_id)
        if not vehicle:
            raise ValueError(f"Vehicle with id {vehicle_id} not found")

        entries = (
            self.db.query(FuelEntry)
            .filter(
                FuelEntry.vehicle_id == vehicle_id,
                FuelEntry.is_active == True,
                FuelEntry.fueling_date >= start_date,
                FuelEntry.fueling_date <= end_date,
            )
            .order_by(
                FuelEntry.fueling_date,
                FuelEntry.odometer_reading,
                FuelEntry.is_full_tank.asc(),
                FuelEntry.id,
            )
            .all()
        )

        days = (end_date - start_date).days + 1
        total_liters = sum(e.liters for e in entries)
        total_cost = sum(e.total_cost for e in entries)

        # Observed distance: odometer span across entries in the period.
        # Clamped at 0: a historical correction (allow_odometer_decrease) can
        # leave the newest entry below the oldest inside the window.
        distance_km = (
            max(
                0.0,
                float(entries[-1].odometer_reading - entries[0].odometer_reading),
            )
            if len(entries) > 1
            else 0.0
        )

        # Consumption: distance-weighted fill-to-fill, anchored at the first
        # full tank inside the period (same rules as the global stats)
        avg_consumption = None
        first_full_idx = next(
            (i for i, e in enumerate(entries) if getattr(e, "is_full_tank", True)),
            None,
        )
        if first_full_idx is not None:
            anchor = float(entries[first_full_idx].odometer_reading)
            acc = seg_liters = seg_km = 0.0
            for e in entries[first_full_idx + 1:]:
                acc += e.liters
                if getattr(e, "is_full_tank", True):
                    d = float(e.odometer_reading) - anchor
                    if d > 0:
                        seg_liters += acc
                        seg_km += d
                    anchor = float(e.odometer_reading)
                    acc = 0.0
            if seg_km > 0:
                avg_consumption = round(seg_liters * 100 / seg_km, 2)

        # Per-fuel breakdown (liters-weighted price)
        by_fuel: dict[str, list[float]] = {}
        for e in entries:
            key = e.fuel_type.value if e.fuel_type else "inconnu"
            bucket = by_fuel.setdefault(key, [0.0, 0.0])
            bucket[0] += e.liters
            bucket[1] += e.total_cost
        fuel_breakdown = [
            FuelTypePeriodBreakdown(
                fuel_type=k,
                liters=round(liters, 2),
                total_cost=round(cost, 2),
                avg_price_per_liter=round(cost / liters, 3) if liters > 0 else 0,
            )
            for k, (liters, cost) in sorted(by_fuel.items())
        ]

        # Maintenance in the period
        maintenances = (
            self.db.query(Maintenance)
            .filter(
                Maintenance.vehicle_id == vehicle_id,
                Maintenance.is_active == True,
                Maintenance.maintenance_date >= start_date,
                Maintenance.maintenance_date <= end_date,
            )
            .all()
        )
        maintenance_cost = round(sum(m.cost for m in maintenances), 2)

        # E85 savings vs 100% E10 — same formula as the rentability calc,
        # bounded to the period (FlexFuel vehicles only)
        e85_savings = None
        e85_share = None
        skipped = 0
        flexfuel = (
            self.db.query(FlexfuelConversion)
            .filter(FlexfuelConversion.vehicle_id == vehicle_id, FlexfuelConversion.is_active == True)
            .first()
        )
        if flexfuel:
            from app.services.flexfuel_service import FlexfuelService
            ff = FlexfuelService(self.db)
            factor = 1 + flexfuel.overconsumption_pct / 100
            savings = 0.0
            e85_liters = 0.0
            for e in entries:
                if e.fuel_type == FuelType.E85 and e.fueling_date >= flexfuel.conversion_date:
                    e85_liters += e.liters
                    ref_price = ff.get_latest_e10_price_at_date(e.fueling_date)
                    if ref_price is None:
                        skipped += 1
                        continue
                    savings += (e.liters / factor) * ref_price - e.total_cost
            e85_savings = round(savings, 2)
            # Note: the share's denominator counts ALL period fills, while the
            # numerator only counts post-conversion E85 fills — when the period
            # spans the conversion date, pre-conversion liters dilute the share.
            # Cosmetic (a % label); documented, not a bug to fix.
            e85_share = round(e85_liters / total_liters, 3) if total_liters > 0 else None

        total_period_cost = total_cost + maintenance_cost
        return VehiclePeriodStats(
            vehicle_id=vehicle_id,
            start_date=start_date,
            end_date=end_date,
            days=days,
            distance_km=distance_km,
            fill_count=len(entries),
            total_liters=round(total_liters, 2),
            total_fuel_cost=round(total_cost, 2),
            avg_consumption=avg_consumption,
            avg_price_per_liter=round(total_cost / total_liters, 3) if total_liters > 0 else None,
            fuel_breakdown=fuel_breakdown,
            e85_savings=e85_savings,
            e85_share_liters=e85_share,
            skipped_fills_no_e10_price=skipped,
            # Spending recorded in the period divided by the observed odometer span.
            # Boundary fills finance travel outside the selected dates, so this is
            # intentionally labelled as spending per observed 100 km in the UI.
            fuel_cost_per_100km=round(total_cost * 100 / distance_km, 2) if distance_km > 0 else None,
            maintenance_cost=maintenance_cost,
            maintenance_count=len(maintenances),
            cost_per_day=round(total_period_cost / days, 2) if days > 0 else None,
            km_per_day=round(distance_km / days, 1) if days > 0 else None,
        )

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

        # Fetch only the single most-recent entry (avoids loading all rows again
        # since FuelService.get_fuel_statistics_by_vehicle already loaded them)
        last_entry = (
            self.db.query(FuelEntry)
            .filter(FuelEntry.vehicle_id == vehicle_id, FuelEntry.is_active == True)
            .order_by(FuelEntry.odometer_reading.desc(), FuelEntry.fueling_date.desc())
            .first()
        )

        last_odometer = None
        days_since_last_entry = None
        total_distance = 0.0

        if last_entry:
            last_odometer = float(last_entry.odometer_reading)

            if last_entry.fueling_date:
                # Clamp at 0: a future-dated fill (typo or offline pre-fill)
                # must not render "il y a -2 jours".
                days_since_last_entry = max(0, (date.today() - last_entry.fueling_date).days)

            # Distance = last odometer - initial odometer
            # (initial_odometer is NOT NULL in the schema; the fuel-stats
            # fallback was unreachable — a falsy last odometer implies
            # fuel_stats.total_distance <= 0 too).
            if last_odometer and vehicle.initial_odometer is not None:
                total_distance = last_odometer - float(vehicle.initial_odometer)
        else:
            last_odometer = vehicle.initial_odometer

        # Cost per km — over the distance actually covered by logged fills
        # (first entry → last entry), not since initial_odometer: fuel burned
        # before the first logged fill was never recorded, so including that
        # distance would understate the ratio.
        total_fuel_cost = fuel_stats.total_cost
        cost_per_km = (
            total_fuel_cost / fuel_stats.total_distance
            if fuel_stats.total_distance > 0
            else 0
        )

        # Insurance limit calculation
        current_insurance_limit = self._calculate_current_insurance_limit(vehicle)
        insurance_km_remaining = None
        insurance_km_exceeded = False

        ref_odometer = last_odometer if last_odometer is not None else vehicle.initial_odometer
        if current_insurance_limit is not None and ref_odometer is not None:
            insurance_km_remaining = current_insurance_limit - ref_odometer
            insurance_km_exceeded = insurance_km_remaining < 0

        # Look up FlexFuel conversion for this vehicle (overconsumption_pct)
        flexfuel = (
            self.db.query(FlexfuelConversion)
            .filter(FlexfuelConversion.vehicle_id == vehicle_id, FlexfuelConversion.is_active == True)
            .first()
        )
        overconsumption_pct = flexfuel.overconsumption_pct if flexfuel else None
        tank = vehicle.tank_capacity

        # Overall range (actual avg, 5 L cushion)
        avg_conso = fuel_stats.average_consumption
        CUSHION_L = 5.0
        overall_range = None
        if avg_conso and avg_conso > 0 and tank:
            overall_range = round(max(0.0, tank - CUSHION_L) * 100 / avg_conso, 0)

        # Per-season stats with E10/E85 normalisation.
        # For FlexFuel, anchor the season buckets to the conversion date so a
        # pre-conversion all-Essence segment doesn't drag the E85 % down.
        seasonal = self._compute_seasonal_consumption(
            vehicle_id,
            overconsumption_pct,
            tank,
            from_date=flexfuel.conversion_date if flexfuel else None,
        )

        return VehicleStats(
            vehicle_id=vehicle_id,
            total_fuel_entries=fuel_stats.total_entries,
            total_fuel_quantity=fuel_stats.total_liters,
            total_distance=total_distance,
            average_consumption=avg_conso,
            average_fuel_price=fuel_stats.average_price_per_liter,
            total_fuel_cost=round(total_fuel_cost, 2),
            cost_per_km=round(cost_per_km, 3),
            last_odometer=last_odometer,
            days_since_last_entry=days_since_last_entry,
            current_insurance_km_limit=round(current_insurance_limit, 2) if current_insurance_limit else None,
            insurance_km_remaining=round(insurance_km_remaining, 2) if insurance_km_remaining is not None else None,
            insurance_km_exceeded=insurance_km_exceeded,
            range_km=overall_range,
            spring=seasonal["spring"],
            summer=seasonal["summer"],
            autumn=seasonal["autumn"],
            winter=seasonal["winter"],
        )
