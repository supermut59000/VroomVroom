from datetime import date, datetime
from typing import Optional, List
from pydantic import BaseModel, ConfigDict, Field, field_validator

from app.core.enums import FuelType


# Base schema with common fields
class FuelEntryBase(BaseModel):
    vehicle_id: int = Field(
        ...,
        ge=1,
        description="Unique identifier for the vehicle",
    )
    fuel_type: FuelType = Field(..., description="Type of fuel used")
    liters: float = Field(..., gt=0, le=200, description="Amount of fuel in liters")
    price_per_liter: float = Field(..., gt=0, le=10, description="Price per liter in currency units")
    odometer_reading: int = Field(..., ge=0, le=9999999, description="Odometer reading in kilometers")
    station_name: Optional[str] = Field(None, max_length=100, description="Name of the gas station")
    location: Optional[str] = Field(None, max_length=100, description="City or location of fueling")
    latitude: Optional[float] = Field(None, ge=-90.0, le=90.0, description="GPS latitude of fueling station")
    longitude: Optional[float] = Field(None, ge=-180.0, le=180.0, description="GPS longitude of fueling station")
    fueling_date: date = Field(default_factory=date.today, description="Date of fueling")
    is_full_tank: bool = Field(
        default=True,
        description="Whether this was a full tank fill-up (affects consumption calculation)",
    )
    notes: Optional[str] = Field(None, max_length=500, description="Additional notes about this fueling")

    @field_validator('liters')
    @classmethod
    def liters_must_be_positive(cls, v: float) -> float:
        if v <= 0:
            raise ValueError("Liters must be positive")
        return v

    @field_validator('price_per_liter')
    @classmethod
    def price_per_liter_must_be_positive(cls, v: float) -> float:
        if v <= 0:
            raise ValueError("Price per liter must be positive")
        return v

    @field_validator('odometer_reading')
    @classmethod
    def odometer_reading_must_be_positive(cls, v: int) -> int:
        if v < 0:
            raise ValueError("Odometer reading must be non-negative")
        return v

class FuelEntryCreate(FuelEntryBase):
    """Schema for creating a fuel entry"""
    pass


class FuelEntryUpdate(BaseModel):
    """Schema for updating a fuel entry"""
    fuel_type: Optional[FuelType] = None
    liters: Optional[float] = Field(None, gt=0, le=200)
    price_per_liter: Optional[float] = Field(None, gt=0, le=10)
    odometer_reading: Optional[int] = Field(None, ge=0, le=9999999)
    station_name: Optional[str] = Field(None, max_length=100)
    location: Optional[str] = Field(None, max_length=100)
    latitude: Optional[float] = Field(None, ge=-90.0, le=90.0)
    longitude: Optional[float] = Field(None, ge=-180.0, le=180.0)
    fueling_date: Optional[date] = None
    is_full_tank: Optional[bool] = None
    notes: Optional[str] = Field(None, max_length=500)

    @field_validator('liters')
    @classmethod
    def liters_must_be_positive(cls, v: float | None) -> float | None:
        if v is not None and v <= 0:
            raise ValueError("Liters must be positive")
        return v

    @field_validator('price_per_liter')
    @classmethod
    def price_per_liter_must_be_positive(cls, v: float | None) -> float | None:
        if v is not None and v <= 0:
            raise ValueError("Price per liter must be positive")
        return v

    @field_validator('odometer_reading')
    @classmethod
    def odometer_reading_must_be_positive(cls, v: int | None) -> int | None:
        if v is not None and v < 0:
            raise ValueError("Odometer reading must be non-negative")
        return v


class FuelEntryResponse(FuelEntryBase):
    """Schema for fuel entry response"""
    id: int
    total_cost: float
    created_at: datetime
    updated_at: Optional[datetime] = None

    model_config = ConfigDict(from_attributes=True)


class FuelEntryListResponse(BaseModel):
    """Schema for fuel entry list response with pagination"""
    entries: List[FuelEntryResponse]
    total: int
    page: int
    per_page: int
    pages: int

    model_config = ConfigDict(from_attributes=True)


class FuelStatisticsResponse(BaseModel):
    """Schema for fuel statistics response"""
    total_entries: int
    total_liters: float
    total_cost: float
    average_price_per_liter: float
    total_distance: int
    average_consumption: Optional[float] = Field(
        None,
        description="Average consumption in L/100km (calculated from full tank entries only)"
    )

    model_config = ConfigDict(from_attributes=True)


class ConsumptionDataPoint(BaseModel):
    """Schema for a single consumption data point"""
    date: date
    consumption: Optional[float] = Field(
        None,
        description="Consumption in L/100km"
    )
    odometer_reading: int
    liters: float
    distance: Optional[int] = Field(
        None,
        description="Distance traveled since last fill-up in km"
    )
    is_full_tank: bool = Field(
        default=True,
        description="Whether this was a full tank fill-up"
    )
    e85_fraction: Optional[float] = Field(
        None,
        description="Fraction of E85 in liters added during this fill-to-fill segment (0..1). Set on full-tank entries only."
    )

    model_config = ConfigDict(from_attributes=True)


class ConsumptionHistoryResponse(BaseModel):
    """Schema for consumption history response"""
    vehicle_id: int
    data_points: List[ConsumptionDataPoint]

    model_config = ConfigDict(from_attributes=True)
