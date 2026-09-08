from sqlalchemy import Column, Integer, String, DateTime, Numeric
from sqlalchemy.sql import func

from app.database import Base


class Producto(Base):
    __tablename__ = "productos"

    id = Column(Integer, primary_key=True, index=True)
    codigo = Column(String, unique=True, index=True, nullable=False)
    nombre = Column(String, nullable=False)
    stock = Column(Integer, nullable=False, default=0)
    precio = Column(Numeric(10, 2), nullable=False, default=0)
    imagen_url = Column(String, nullable=True)
    actualizado_en = Column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
    )
