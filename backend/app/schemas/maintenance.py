from datetime import date, datetime
from typing import Optional, List
from pydantic import BaseModel, ConfigDict, Field



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
    cost: float = Field(..., ge=0, le=100000, description="Cost of maintenance")
    odometer_reading: int = Field(..., ge=0, le=9999999, description="Odometer reading in kilometers")
    service_provider: Optional[str] = Field(None, max_length=100, description="Name of the service provider")
    location: Optional[str] = Field(None, max_length=100, description="City or location of service")
    maintenance_date: date = Field(default_factory=date.today, description="Date of maintenance")
    notes: Optional[str] = Field(None, max_length=500, description="Additional notes about this maintenance")
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


class MaintenanceResponse(MaintenanceBase):
    """Schema for maintenance entry response"""
    id: int
    created_at: datetime
    updated_at: Optional[datetime] = None

    model_config = ConfigDict(from_attributes=True)


class MaintenanceListResponse(BaseModel):
    """Schema for maintenance entry list response with pagination"""
    entries: List[MaintenanceResponse]
    total: int
    page: int
    per_page: int
    pages: int

    model_config = ConfigDict(from_attributes=True)


class MaintenanceStatisticsResponse(BaseModel):
    """Schema for maintenance statistics response"""
    total_entries: int
    total_cost: float
    average_cost: float
    last_maintenance_date: Optional[date] = None
    next_maintenance_date: Optional[date] = None

    model_config = ConfigDict(from_attributes=True)
