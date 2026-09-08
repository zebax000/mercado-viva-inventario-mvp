import os
from dotenv import load_dotenv
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker, declarative_base

load_dotenv()

DATABASE_URL = os.getenv("DATABASE_URL")

if not DATABASE_URL:
    raise RuntimeError(
        "DATABASE_URL no esta definida. Crea un archivo .env basado en .env.example "
        "con el connection string de Neon."
    )

engine = create_engine(
    DATABASE_URL,
    pool_pre_ping=True,   # revisa la conexion antes de usarla; la renueva si Neon ya la cerro
    pool_recycle=300,     # descarta conexiones cada 5 minutos, antes de que el pooler de Neon las cierre por inactividad
)

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

Base = declarative_base()


def get_db():
    """Dependencia de FastAPI: abre una sesion de base de datos por request y la cierra al terminar."""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
