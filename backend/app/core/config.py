import os
from typing import Optional, List
from pydantic_settings import BaseSettings

class Settings(BaseSettings):
    # API Configuration
    API_V1_STR: str = "/api/v1"
    PROJECT_NAME: str = "Vehicle Management API"
    PROJECT_DESCRIPTION: str = "API de gestion personnelle des véhicules"
    VERSION: str = "1.0.0"

    # Database Configuration MariaDB (must be set in .env)
    DB_HOST: str
    DB_PORT: int = 3306
    DB_USER: str
    DB_PASSWORD: str
    DB_NAME: str = "vehicle_management"

    @property
    def database_url(self) -> str:
        # URL de connexion MariaDB/MySQL
        return f"mysql+pymysql://{self.DB_USER}:{self.DB_PASSWORD}@{self.DB_HOST}:{self.DB_PORT}/{self.DB_NAME}?charset=utf8mb4"

    # Environment
    DEBUG: bool = False
    ENVIRONMENT: str = "development"

    # CORS - Use string and convert to list when needed
    BACKEND_CORS_ORIGINS: str = "http://localhost:3000,http://localhost:3055,http://localhost:8080"
    
    @property
    def cors_origins_list(self) -> List[str]:
        """Convert CORS origins string to list"""
        return [origin.strip() for origin in self.BACKEND_CORS_ORIGINS.split(",")]

    # API Key authentication (optional — if empty, auth is disabled)
    API_KEY: str = ""

    # Routing — driving distance/time between the user and fuel stations.
    # Defaults to the public OSRM demo server (no key, fair-use only).
    # Point ROUTING_URL at a self-hosted OSRM container in .env for unlimited use.
    ROUTING_URL: str = "https://router.project-osrm.org"
    # "osrm" or "valhalla" — Valhalla is tile-based and needs far less RAM,
    # at the cost of a different matrix API (handled in RoutingService).
    ROUTING_PROVIDER: str = "osrm"
    # OSRM calls it a profile ("driving"), Valhalla calls it a costing ("auto").
    ROUTING_PROFILE: str = "driving"
    ROUTING_PROFILE_VALHALLA: str = "auto"
    ROUTING_TIMEOUT: float = 8.0
    # Destinations per provider request. osrm-routed defaults to a 100
    # coordinate table limit (origin included), so stay under it and let the
    # service split larger searches into concurrent batches.
    ROUTING_MAX_BATCH: int = 95
    ROUTING_MAX_CONCURRENCY: int = 4
    # Road distances between two fixed points don't change; 6 h keeps the
    # demo server untouched for a whole day of normal use.
    ROUTING_CACHE_TTL: int = 21600

    # Logging
    LOG_LEVEL: str = "INFO"

    # Database pool settings (optionnel)
    DB_POOL_SIZE: int = 5
    DB_MAX_OVERFLOW: int = 10
    DB_POOL_TIMEOUT: int = 30

    class Config:
        env_file = ".env"
        case_sensitive = True

settings = Settings()
