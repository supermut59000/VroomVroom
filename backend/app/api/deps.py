from typing import Generator
from fastapi import Depends, HTTPException, Security, status
from fastapi.security import APIKeyHeader
from sqlalchemy.orm import Session
from app.core.database import SessionLocal
from app.core.config import settings


def get_db() -> Generator[Session, None, None]:
    """
    Générateur de session de base de données pour FastAPI.
    """
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


_api_key_header = APIKeyHeader(name="X-API-Key", auto_error=False)


async def verify_api_key(api_key: str | None = Security(_api_key_header)):
    """
    Vérifie la clé API si API_KEY est configurée dans .env.
    Si API_KEY est vide, l'authentification est désactivée.
    """
    if not settings.API_KEY:
        return  # Auth disabled
    if not api_key or api_key != settings.API_KEY:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Clé API invalide ou manquante",
        )
