from datetime import date
from sqlalchemy import Column, Integer, String, Float, Date, Text, Boolean, DateTime
from sqlalchemy.sql import func
from sqlalchemy.orm import relationship

from app.core.database import Base


class Vehicle(Base):
    __tablename__ = "vehicles"

    # Identifiant unique
    id = Column(Integer, primary_key=True, index=True)

    # Informations de base du véhicule
    brand = Column(String(50), nullable=False, index=True)
    model = Column(String(50), nullable=False)
    year = Column(Integer, nullable=False)
    license_plate = Column(String(20), unique=True, nullable=False, index=True)

    # Informations techniques
    initial_odometer = Column(Float, default=0.0, nullable=False)
    tank_capacity = Column(Float)  # Capacité en litres
    fuel_type = Column(String(20), nullable=False)  # essence, diesel, electrique, hybride

    # Informations d'acquisition
    acquisition_date = Column(Date, nullable=True)
    purchase_price = Column(Float, nullable=True)

    # Insurance mileage tracking
    insurance_km_limit = Column(Float, nullable=True)  # Initial km limit
    insurance_km_annual_increase = Column(Float, nullable=True)  # Annual km increase
    insurance_km_start_date = Column(Date, nullable=True)  # When the limit starts

    # Métadonnées
    description = Column(Text, nullable=True)
    is_active = Column(Boolean, default=True, nullable=False)

    # Timestamps automatiques
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())

    # Relations
    fuel_entries = relationship("FuelEntry", back_populates="vehicle", cascade="all, delete-orphan")
    maintenances = relationship("Maintenance", back_populates="vehicle", cascade="all, delete-orphan")

    def __repr__(self):
        return f"<Vehicle(id={self.id}, brand='{self.brand}', model='{self.model}', license_plate='{self.license_plate}')>"
