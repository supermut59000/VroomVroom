from sqlalchemy import Column, Integer, Float, Date, Text, DateTime, ForeignKey, UniqueConstraint
from sqlalchemy.sql import func
from sqlalchemy.orm import relationship

from app.core.database import Base


class E10ReferencePrice(Base):
    __tablename__ = "e10_reference_prices"

    id = Column(Integer, primary_key=True, index=True)
    vehicle_id = Column(Integer, ForeignKey("vehicles.id"), nullable=False)

    reference_date = Column(Date, nullable=False)
    price_per_liter = Column(Float, nullable=False)
    notes = Column(Text, nullable=True)

    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())

    __table_args__ = (
        UniqueConstraint('vehicle_id', 'reference_date', name='uq_vehicle_date'),
    )

    vehicle = relationship("Vehicle", back_populates="e10_reference_prices")

    def __repr__(self):
        return f"<E10ReferencePrice(id={self.id}, vehicle={self.vehicle_id}, date={self.reference_date}, price={self.price_per_liter})>"
