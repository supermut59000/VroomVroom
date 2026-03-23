from datetime import date, datetime
from typing import Optional, List
from pydantic import BaseModel, Field


# ---- FlexFuel Conversion ----

class FlexfuelConversionBase(BaseModel):
    conversion_date: date
    kit_cost: float = Field(..., gt=0, description="Cost of the FlexFuel kit in EUR")
    overconsumption_pct: float = Field(default=20.0, gt=0, le=100, description="E85 overconsumption percentage vs E10")
    kit_brand: Optional[str] = Field(None, max_length=100)
    installer: Optional[str] = Field(None, max_length=100)
    notes: Optional[str] = None


class FlexfuelConversionCreate(FlexfuelConversionBase):
    vehicle_id: int = Field(..., ge=1)


class FlexfuelConversionUpdate(BaseModel):
    conversion_date: Optional[date] = None
    kit_cost: Optional[float] = Field(None, gt=0)
    overconsumption_pct: Optional[float] = Field(None, gt=0, le=100)
    kit_brand: Optional[str] = Field(None, max_length=100)
    installer: Optional[str] = Field(None, max_length=100)
    notes: Optional[str] = None


class FlexfuelConversionResponse(FlexfuelConversionBase):
    id: int
    vehicle_id: int
    created_at: datetime
    updated_at: Optional[datetime] = None

    class Config:
        from_attributes = True


# ---- E10 Reference Price ----

class E10ReferencePriceBase(BaseModel):
    reference_date: date
    price_per_liter: float = Field(..., gt=0, le=10, description="E10 reference price per liter in EUR")
    notes: Optional[str] = None


class E10ReferencePriceCreate(E10ReferencePriceBase):
    pass


class E10ReferencePriceUpdate(BaseModel):
    reference_date: Optional[date] = None
    price_per_liter: Optional[float] = Field(None, gt=0, le=10)
    notes: Optional[str] = None


class E10ReferencePriceResponse(E10ReferencePriceBase):
    id: int
    created_at: datetime
    updated_at: Optional[datetime] = None

    class Config:
        from_attributes = True


# ---- Rentability ----

class FlexfuelSavingsDataPoint(BaseModel):
    date: date
    e85_liters: float
    e85_cost: float
    equivalent_e10_liters: float
    e10_reference_price: float
    e10_equivalent_cost: float
    savings: float
    cumulative_savings: float


class FlexfuelMonthlySavings(BaseModel):
    month: str
    savings: float


class FlexfuelRentabilitySummary(BaseModel):
    vehicle_id: int
    kit_cost: float
    overconsumption_pct: float
    conversion_date: date
    total_e85_fills: int
    total_savings: float
    break_even_reached: bool
    break_even_date: Optional[date] = None
    monthly_average_savings: Optional[float] = None
    data_points: List[FlexfuelSavingsDataPoint]
    monthly_savings: List[FlexfuelMonthlySavings]
