from sqlalchemy import create_engine
from sqlalchemy.orm import declarative_base
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import QueuePool

from app.core.config import settings

# Création de l'engine MariaDB
engine = create_engine(
    settings.database_url,
    # Configuration pour MariaDB (pas SQLite)
    pool_size=settings.DB_POOL_SIZE,
    max_overflow=settings.DB_MAX_OVERFLOW,
    pool_timeout=settings.DB_POOL_TIMEOUT,
    pool_recycle=3600,  # Recycle les connexions après 1h
    pool_pre_ping=True,  # Vérifie la connexion avant utilisation
    echo=settings.DEBUG,  # Log des requêtes SQL en mode debug
    poolclass=QueuePool,
    # Options MariaDB/MySQL spécifiques
    connect_args={
        "charset": "utf8mb4",
        "autocommit": False,
    }
)

# Session factory
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

# Base class pour les modèles
Base = declarative_base()


def get_db():
    """
    Dépendance pour obtenir une session de base de données.
    """
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


# Fonction pour tester la connexion
def test_connection():
    """
    Teste la connexion à la base de données
    """
    try:
        with engine.connect() as connection:
            result = connection.execute("SELECT 1")
            print("✅ Connexion à MariaDB réussie !")
            return True
    except Exception as e:
        print(f"❌ Erreur de connexion à MariaDB: {e}")
        return False
