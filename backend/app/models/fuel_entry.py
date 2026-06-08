from sqlalchemy import Column, Integer, String, Float, Date, DateTime, Text, Enum as SQLEnum, Boolean, ForeignKey, Index
from sqlalchemy.sql import func
from sqlalchemy.orm import relationship
from datetime import date, datetime

from app.core.database import Base
from app.core.enums import FuelType

class FuelEntry(Base):
    __tablename__ = "fuel_entries"
    __table_args__ = (
        # Most queries filter on (vehicle_id, is_active) together — a composite
        # index lets MariaDB skip the full per-vehicle scan for soft-deleted rows.
        Index("ix_fuel_entries_vehicle_active", "vehicle_id", "is_active"),
    )

    # Primary key
    id = Column(Integer, primary_key=True, index=True)

    # Vehicle information
    vehicle_id = Column(Integer, ForeignKey("vehicles.id"), nullable=False, index=True)

    # Fuel details
    fuel_type = Column(SQLEnum(FuelType), nullable=False)
    liters = Column(Float, nullable=False)
    price_per_liter = Column(Float, nullable=False)
    total_cost = Column(Float, nullable=False)  # Calculated field

    # Vehicle state
    odometer_reading = Column(Integer, nullable=False)

    # Location and context
    station_name = Column(String(100), nullable=True)
    location = Column(String(100), nullable=True)
    latitude = Column(Float, nullable=True)
    longitude = Column(Float, nullable=True)

    # Date and notes
    fueling_date = Column(Date, nullable=False, default=date.today, index=True)
    is_full_tank = Column(Boolean, nullable=False, default=True)
    notes = Column(Text, nullable=True)

    # Soft delete
    is_active = Column(Boolean, nullable=False, default=True)

    # Metadata
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())

    # Relations
    vehicle = relationship("Vehicle", back_populates="fuel_entries")

    def __repr__(self):
        return f"<FuelEntry(id={self.id}, vehicle={self.vehicle_id}, date={self.fueling_date})>"
