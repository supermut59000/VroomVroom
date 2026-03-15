from datetime import date, datetime
from typing import Optional
from pydantic import BaseModel, Field, field_validator

from app.core.enums import FuelType


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
    insurance_km_limit: Optional[float] = Field(None, ge=0, description="Limite kilométrique initiale d'assurance")
    insurance_km_annual_increase: Optional[float] = Field(None, ge=0, description="Augmentation annuelle de la limite (km)")
    insurance_km_start_date: Optional[date] = Field(None, description="Date de début du suivi kilométrique")
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
    insurance_km_limit: Optional[float] = Field(None, ge=0)
    insurance_km_annual_increase: Optional[float] = Field(None, ge=0)
    insurance_km_start_date: Optional[date] = None
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

    class Config:
        from_attributes = True  # Pydantic v2


# Schéma pour les listes (version allégée)
class VehicleList(BaseModel):
    id: int
    brand: str
    model: str
    year: int
    license_plate: str
    fuel_type: FuelType
    is_active: bool

    class Config:
        from_attributes = True


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
