from sqlalchemy import Column, Integer, String, Float, Date, DateTime, Text, ForeignKey
from sqlalchemy.sql import func
from sqlalchemy.orm import relationship
from datetime import date, datetime

from app.core.database import Base

class Maintenance(Base):
    __tablename__ = "maintenances"

    # Primary key
    id = Column(Integer, primary_key=True, index=True)

    # Vehicle information
    vehicle_id = Column(Integer, ForeignKey("vehicles.id"), nullable=False, index=True)

    # Maintenance details
    maintenance_type = Column(String(100), nullable=False)
    description = Column(Text, nullable=True)
    cost = Column(Float, nullable=False)

    # Vehicle state
    odometer_reading = Column(Integer, nullable=False)

    # Service provider information
    service_provider = Column(String(100), nullable=True)
    location = Column(String(100), nullable=True)

    # Date and notes
    maintenance_date = Column(Date, nullable=False, default=date.today)
    notes = Column(Text, nullable=True)

    # Next maintenance reminder (optional)
    next_maintenance_date = Column(Date, nullable=True)
    next_maintenance_odometer = Column(Integer, nullable=True)

    # Metadata
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())

    # Relations
    vehicle = relationship("Vehicle", back_populates="maintenances")

    def __repr__(self):
        return f"<Maintenance(id={self.id}, vehicle={self.vehicle_id}, type={self.maintenance_type}, date={self.maintenance_date})>"
