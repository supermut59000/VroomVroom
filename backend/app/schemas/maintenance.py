from datetime import date, datetime
from typing import Optional, List
from pydantic import BaseModel, Field, field_validator


# Base schema with common fields
class MaintenanceBase(BaseModel):
    vehicle_id: int = Field(
        ...,
        ge=1,
        description="Unique identifier for the vehicle",
    )
    maintenance_type: str = Field(..., min_length=1, max_length=100, description="Type of maintenance")
    description: Optional[str] = Field(
        None,
        max_length=500,
        description="Description of the maintenance work",
    )
    cost: float = Field(
        ..., ge=0, le=100000, description="Cost of maintenance", example=85.50
    )
    odometer_reading: int = Field(
        ...,
        ge=0,
        le=9999999,
        description="Odometer reading in kilometers",
        example=125000,
    )
    service_provider: Optional[str] = Field(
        None,
        max_length=100,
        description="Name of the service provider",
        example="Garage Renault",
    )
    location: Optional[str] = Field(
        None,
        max_length=100,
        description="City or location of service",
        example="Paris, France",
    )
    maintenance_date: date = Field(
        default_factory=date.today, description="Date of maintenance"
    )
    notes: Optional[str] = Field(
        None,
        max_length=500,
        description="Additional notes about this maintenance",
        example="Prochain contr�le dans 6 mois",
    )
    next_maintenance_date: Optional[date] = Field(
        None,
        description="Recommended date for next maintenance",
    )
    next_maintenance_odometer: Optional[int] = Field(
        None,
        ge=0,
        le=9999999,
        description="Recommended odometer reading for next maintenance",
    )

    @field_validator('cost')
    def cost_must_be_positive(cls, v):
        if v < 0:
            raise ValueError("Cost must be non-negative")
        return v

    @field_validator('odometer_reading')
    def odometer_reading_must_be_positive(cls, v):
        if v < 0:
            raise ValueError("Odometer reading must be non-negative")
        return v

    @field_validator('next_maintenance_odometer')
    def next_odometer_must_be_positive(cls, v):
        if v is not None and v < 0:
            raise ValueError("Next odometer reading must be non-negative")
        return v


class MaintenanceCreate(MaintenanceBase):
    """Schema for creating a maintenance entry"""
    pass


class MaintenanceUpdate(BaseModel):
    """Schema for updating a maintenance entry"""
    maintenance_type: Optional[str] = Field(None, min_length=1, max_length=100)
    description: Optional[str] = Field(None, max_length=500)
    cost: Optional[float] = Field(None, ge=0, le=100000)
    odometer_reading: Optional[int] = Field(None, ge=0, le=9999999)
    service_provider: Optional[str] = Field(None, max_length=100)
    location: Optional[str] = Field(None, max_length=100)
    maintenance_date: Optional[date] = None
    notes: Optional[str] = Field(None, max_length=500)
    next_maintenance_date: Optional[date] = None
    next_maintenance_odometer: Optional[int] = Field(None, ge=0, le=9999999)

    @field_validator('cost')
    def cost_must_be_positive(cls, v):
        if v is not None and v < 0:
            raise ValueError("Cost must be non-negative")
        return v

    @field_validator('odometer_reading')
    def odometer_reading_must_be_positive(cls, v):
        if v is not None and v < 0:
            raise ValueError("Odometer reading must be non-negative")
        return v

    @field_validator('next_maintenance_odometer')
    def next_odometer_must_be_positive(cls, v):
        if v is not None and v < 0:
            raise ValueError("Next odometer reading must be non-negative")
        return v


class MaintenanceResponse(MaintenanceBase):
    """Schema for maintenance entry response"""
    id: int
    created_at: datetime
    updated_at: Optional[datetime] = None

    class Config:
        from_attributes = True


class MaintenanceListResponse(BaseModel):
    """Schema for maintenance entry list response with pagination"""
    entries: List[MaintenanceResponse]
    total: int
    page: int
    per_page: int
    pages: int

    class Config:
        from_attributes = True


class MaintenanceStatisticsResponse(BaseModel):
    """Schema for maintenance statistics response"""
    total_entries: int
    total_cost: float
    average_cost: float
    last_maintenance_date: Optional[date] = None
    next_maintenance_date: Optional[date] = None

    class Config:
        from_attributes = True
