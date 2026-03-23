from sqlalchemy import Column, Integer, Float, Date, Text, DateTime, UniqueConstraint
from sqlalchemy.sql import func

from app.core.database import Base


class E10ReferencePrice(Base):
    __tablename__ = "e10_reference_prices"

    id = Column(Integer, primary_key=True, index=True)

    reference_date = Column(Date, nullable=False, unique=True)
    price_per_liter = Column(Float, nullable=False)
    notes = Column(Text, nullable=True)

    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())

    def __repr__(self):
        return f"<E10ReferencePrice(id={self.id}, date={self.reference_date}, price={self.price_per_liter})>"
