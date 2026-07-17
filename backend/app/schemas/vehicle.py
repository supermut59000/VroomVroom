from datetime import date, datetime
from typing import Any, Dict, List, Literal, Optional
from pydantic import BaseModel, ConfigDict, Field, field_validator

from app.core.enums import FuelType


class SeasonStats(BaseModel):
    """Per-season consumption and range statistics.

    avg_consumption  : distance-weighted L/100km for that season (total_liters/total_km × 100)
    min_consumption  : lowest fill-to-fill L/100km recorded (best conditions)
    max_consumption  : highest fill-to-fill L/100km recorded (worst conditions)
    e85_fraction     : fraction of E85 in fills added during that season (0.0–1.0)
    e10_consumption  : distance-weighted consumption normalised to pure E10
    e85_consumption  : distance-weighted consumption normalised to pure E85
    range_km         : (tank − 5 L) × 100 / avg_consumption   (actual mix)
    range_km_best    : (tank − 5 L) × 100 / min_consumption   (best conditions)
    range_km_worst   : (tank − 5 L) × 100 / max_consumption   (worst conditions)
    range_km_e10     : (tank − 5 L) × 100 / e10_consumption
    range_km_e85     : (tank − 5 L) × 100 / e85_consumption
    fill_count       : number of fill-to-fill data points (reliability indicator)
    """

    avg_consumption: Optional[float] = None
    min_consumption: Optional[float] = None
    max_consumption: Optional[float] = None
    e85_fraction: Optional[float] = None
    e10_consumption: Optional[float] = None
    e85_consumption: Optional[float] = None
    range_km: Optional[float] = None
    range_km_best: Optional[float] = None
    range_km_worst: Optional[float] = None
    range_km_e10: Optional[float] = None
    range_km_e85: Optional[float] = None
    fill_count: int = 0


# Schéma de base partagé
class VehicleBase(BaseModel):
    brand: str = Field(..., min_length=1, max_length=50, description="Marque du véhicule")
    model: str = Field(..., min_length=1, max_length=50, description="Modèle du véhicule")
    year: int = Field(..., ge=1900, le=2030, description="Année de fabrication")
    license_plate: str = Field(..., min_length=2, max_length=20, description="Plaque d'immatriculation")
    fuel_type: FuelType = Field(..., description="Type de carburant")
    initial_odometer: float = Field(default=0.0, ge=0, description="Kilométrage initial")
    tank_capacity: Optional[float] = Field(None, gt=0, description="Capacité du réservoir en litres")
    acquisition_date: Optional[date] = Field(None, description="Date d'acquisition")
    purchase_price: Optional[float] = Field(None, ge=0, description="Prix d'achat")
    yearly_fixed_costs: Optional[float] = Field(None, ge=0, description="Frais fixes annuels (assurance, CT...)")
    insurance_km_limit: Optional[float] = Field(None, ge=0, description="Limite kilométrique initiale d'assurance")
    insurance_km_annual_increase: Optional[float] = Field(None, ge=0, description="Augmentation annuelle de la limite (km)")
    insurance_km_start_date: Optional[date] = Field(None, description="Date de début du suivi kilométrique")
    insurance_unlimited: bool = Field(default=False, description="Kilométrage illimité (pas de plafond)")
    description: Optional[str] = Field(None, max_length=1000, description="Description ou notes")
    is_active: bool = Field(default=True, description="Véhicule actif ou non")

    @field_validator('license_plate')
    @classmethod
    def license_plate_must_be_uppercase(cls, v: str) -> str:
        return v.upper().strip()

    @field_validator('brand', 'model')
    @classmethod
    def names_must_be_capitalized(cls, v: str) -> str:
        return v.strip().title()


# Schéma pour la création
class VehicleCreate(VehicleBase):
    pass


# Schéma pour la mise à jour (tous les champs optionnels)
class VehicleUpdate(BaseModel):
    brand: Optional[str] = Field(None, min_length=1, max_length=50)
    model: Optional[str] = Field(None, min_length=1, max_length=50)
    year: Optional[int] = Field(None, ge=1900, le=2030)
    license_plate: Optional[str] = Field(None, min_length=2, max_length=20)
    fuel_type: Optional[FuelType] = None
    initial_odometer: Optional[float] = Field(None, ge=0)
    tank_capacity: Optional[float] = Field(None, gt=0)
    acquisition_date: Optional[date] = None
    purchase_price: Optional[float] = Field(None, ge=0)
    yearly_fixed_costs: Optional[float] = Field(None, ge=0)
    insurance_km_limit: Optional[float] = Field(None, ge=0)
    insurance_km_annual_increase: Optional[float] = Field(None, ge=0)
    insurance_km_start_date: Optional[date] = None
    insurance_unlimited: Optional[bool] = None
    description: Optional[str] = Field(None, max_length=1000)
    is_active: Optional[bool] = None

    @field_validator('license_plate', mode='before')
    @classmethod
    def license_plate_must_be_uppercase(cls, v: str | None) -> str | None:
        return v.upper().strip() if v else None

    @field_validator('brand', 'model', mode='before')
    @classmethod
    def names_must_be_capitalized(cls, v: str | None) -> str | None:
        return v.strip().title() if v else None


# Schéma de réponse
class VehicleResponse(VehicleBase):
    id: int
    created_at: datetime
    updated_at: Optional[datetime] = None

    model_config = ConfigDict(from_attributes=True)  # Pydantic v2


# Schéma pour les listes (version allégée)
class VehicleList(BaseModel):
    id: int
    brand: str
    model: str
    year: int
    license_plate: str
    fuel_type: FuelType
    is_active: bool
    insurance_unlimited: bool = False

    model_config = ConfigDict(from_attributes=True)


# Schéma pour les statistiques de véhicule
class VehicleStats(BaseModel):
    vehicle_id: int
    total_fuel_entries: int
    total_distance: float
    total_fuel_quantity: Optional[float] = None
    average_consumption: Optional[float] = None
    average_fuel_price: Optional[float] = None
    total_fuel_cost: float
    cost_per_km: Optional[float] = None
    last_odometer: Optional[float] = None
    days_since_last_entry: Optional[int] = None
    # Insurance mileage tracking
    current_insurance_km_limit: Optional[float] = None
    insurance_km_remaining: Optional[float] = None
    insurance_km_exceeded: bool = False
    # Autonomy — overall + per meteorological season
    # Seasons: Printemps (3-5), Été (6-8), Automne (9-11), Hiver (12-2)
    range_km: Optional[float] = None  # overall (actual avg, 5 L cushion)
    spring: Optional[SeasonStats] = None
    summer: Optional[SeasonStats] = None
    autumn: Optional[SeasonStats] = None
    winter: Optional[SeasonStats] = None


# Bilan de période — stats entre deux dates
class FuelTypePeriodBreakdown(BaseModel):
    fuel_type: str
    liters: float
    total_cost: float
    avg_price_per_liter: float


class VehiclePeriodStats(BaseModel):
    vehicle_id: int
    start_date: date
    end_date: date
    days: int
    # Essentiels
    distance_km: float
    fill_count: int
    total_liters: float
    total_fuel_cost: float
    avg_consumption: Optional[float] = None       # L/100km, pondérée distance, fill-to-fill
    avg_price_per_liter: Optional[float] = None   # pondéré litres, tous carburants
    fuel_breakdown: List[FuelTypePeriodBreakdown] = []
    # Économies E85 (FlexFuel uniquement)
    e85_savings: Optional[float] = None           # vs 100% E10, même formule que la rentabilité
    e85_share_liters: Optional[float] = None      # part des litres en E85 (0..1)
    skipped_fills_no_e10_price: int = 0
    # Coûts avancés
    fuel_cost_per_100km: Optional[float] = None
    maintenance_cost: float = 0
    maintenance_count: int = 0
    cost_per_day: Optional[float] = None          # (carburant + maintenance) / jours
    km_per_day: Optional[float] = None


# Schéma pour la timeline unifiée
class VehicleTimelineEvent(BaseModel):
    event_type: Literal["fuel", "maintenance"]
    event_date: date
    event_id: int
    odometer_reading: int
    data: Dict[str, Any]

    model_config = ConfigDict(from_attributes=True)


class VehicleTimeline(BaseModel):
    vehicle_id: int
    events: List[VehicleTimelineEvent]
