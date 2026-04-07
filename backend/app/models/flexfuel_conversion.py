from sqlalchemy import Column, Integer, Float, Date, String, Text, DateTime, ForeignKey
from sqlalchemy.sql import func
from sqlalchemy.orm import relationship

from app.core.database import Base


class FlexfuelConversion(Base):
    __tablename__ = "flexfuel_conversions"

    id = Column(Integer, primary_key=True, index=True)
    vehicle_id = Column(Integer, ForeignKey("vehicles.id"), nullable=False, unique=True)

    conversion_date = Column(Date, nullable=False)
    kit_cost = Column(Float, nullable=False)
    overconsumption_pct = Column(Float, nullable=False, default=20.0)
    kit_brand = Column(String(100), nullable=True)
    installer = Column(String(100), nullable=True)
    notes = Column(Text, nullable=True)
    target_ethanol_pct = Column(Float, nullable=False, default=77.0)
    ethanol_tolerance_pct = Column(Float, nullable=False, default=5.0)

    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())

    vehicle = relationship("Vehicle", back_populates="flexfuel_conversion")

    def __repr__(self):
        return f"<FlexfuelConversion(id={self.id}, vehicle={self.vehicle_id}, date={self.conversion_date})>"
