import logging
import sys
from app.core.config import settings


def setup_logger():
    """Configure le logging pour l'application."""
    
    # Format des logs
    formatter = logging.Formatter(
        fmt='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
        datefmt='%Y-%m-%d %H:%M:%S'
    )
    
    # Handler pour la console
    console_handler = logging.StreamHandler(sys.stdout)
    console_handler.setFormatter(formatter)
    
    # Logger principal
    logger = logging.getLogger("vehicle_management")
    logger.setLevel(getattr(logging, settings.log_level.upper()))
    logger.addHandler(console_handler)
    
    # Logger pour SQLAlchemy (si debug activé)
    if settings.debug:
        logging.getLogger("sqlalchemy.engine").setLevel(logging.INFO)
    
    return logger


# Logger global
logger = setup_logger()
