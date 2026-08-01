from typing import List, Optional

from pydantic import BaseModel, Field

# A 50 km search around a dense area returns a few hundred stations (288 around
# Nieppe). Requests larger than one provider batch are split automatically.
MAX_DESTINATIONS = 300


class Coordinate(BaseModel):
    latitude: float = Field(..., ge=-90, le=90)
    longitude: float = Field(..., ge=-180, le=180)


class RouteMatrixRequest(BaseModel):
    origin: Coordinate
    destinations: List[Coordinate] = Field(..., min_length=1, max_length=MAX_DESTINATIONS)


class RouteLeg(BaseModel):
    """Road distance/time from the origin to one destination.

    Both fields are None when the provider is unreachable or the destination
    can't be routed to — callers fall back to straight-line distance.
    """

    distance_m: Optional[float] = None
    duration_s: Optional[float] = None


class RouteMatrixResponse(BaseModel):
    legs: List[RouteLeg]
    provider: str
    # True when every leg came from cache (no provider call was made).
    cached: bool
