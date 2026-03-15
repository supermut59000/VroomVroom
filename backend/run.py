#!/usr/bin/env python3
"""
Script de démarrage pour l'API Vehicle Management
"""
import os
import uvicorn
from app.core.config import settings

if __name__ == "__main__":
    # Créer le répertoire data s'il n'existe pas
    os.makedirs("data", exist_ok=True)
    
    uvicorn.run(
        "app.main:app",
        host="0.0.0.0",
        port=8000,
        reload=settings.DEBUG,
        log_level=settings.LOG_LEVEL.lower(),
        access_log=True
    )
