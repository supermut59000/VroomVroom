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
