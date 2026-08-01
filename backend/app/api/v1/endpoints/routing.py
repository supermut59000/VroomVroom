import logging

from fastapi import APIRouter

from app.core.config import settings
from app.schemas.routing import RouteMatrixRequest, RouteMatrixResponse
from app.services.routing_service import RoutingService

logger = logging.getLogger(__name__)

router = APIRouter()


@router.post("/matrix", response_model=RouteMatrixResponse)
def route_matrix(payload: RouteMatrixRequest) -> RouteMatrixResponse:
    """Road distance and driving time from one origin to several destinations.

    POST rather than GET because 50 coordinate pairs make an unwieldy query
    string. Never fails on provider trouble: unroutable or unavailable legs
    come back with null fields so the caller can fall back to straight-line
    distance.
    """
    service = RoutingService()
    legs, cached = service.get_matrix(payload.origin, payload.destinations)
    return RouteMatrixResponse(legs=legs, provider=settings.ROUTING_URL, cached=cached)
