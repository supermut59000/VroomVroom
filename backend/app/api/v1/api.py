from fastapi import APIRouter, Depends

from app.api.deps import verify_api_key
from app.api.v1.endpoints import vehicles
from app.api.v1.endpoints import fuel_entries
from app.api.v1.endpoints import maintenances
from app.api.v1.endpoints import flexfuel
from app.api.v1.endpoints import routing

api_router = APIRouter(dependencies=[Depends(verify_api_key)])

# Inclure les routes des véhicules
api_router.include_router(
    vehicles.router,
    prefix="/vehicles",
    tags=["vehicles"]
)

api_router.include_router(
    fuel_entries.router,
    prefix="/fuel-entries",
    tags=["fuel-entries"]
)

api_router.include_router(
    maintenances.router,
    prefix="/maintenances",
    tags=["maintenances"]
)

api_router.include_router(
    flexfuel.router,
    prefix="/flexfuel",
    tags=["flexfuel"]
)

api_router.include_router(
    routing.router,
    prefix="/routing",
    tags=["routing"]
)
