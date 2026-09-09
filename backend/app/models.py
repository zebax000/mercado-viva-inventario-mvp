from datetime import date

from sqlalchemy import Column, Integer, String, DateTime, Numeric
from sqlalchemy.sql import func

from app.database import Base

DIAS_SEMANA = ["LU", "MA", "MI", "JU", "VI", "SA", "DO"]


class Producto(Base):
    __tablename__ = "productos"

    id = Column(Integer, primary_key=True, index=True)
    codigo = Column(String, unique=True, index=True, nullable=False)
    nombre = Column(String, nullable=False)
    stock = Column(Integer, nullable=False, default=0)
    precio = Column(Numeric(10, 2), nullable=False, default=0)
    imagen_url = Column(String, nullable=True)
    categoria = Column(String, nullable=True, index=True)
    subcategoria = Column(String, nullable=True, index=True)
    descuento_porcentaje = Column(Numeric(5, 2), nullable=False, default=0)
    dias_descuento = Column(String, nullable=True)  # CSV de codigos: "LU,MA,MI,JU,VI,SA,DO"
    actualizado_en = Column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
    )

    @property
    def en_descuento_hoy(self) -> bool:
        """True si hoy es uno de los dias configurados y el descuento es mayor a 0."""
        if not self.dias_descuento or not self.descuento_porcentaje:
            return False
        dias_activos = [d.strip().upper() for d in self.dias_descuento.split(",") if d.strip()]
        hoy = DIAS_SEMANA[date.today().weekday()]
        return hoy in dias_activos and float(self.descuento_porcentaje) > 0

    @property
    def precio_final(self) -> float:
        """Precio con el descuento del dia aplicado, si corresponde."""
        precio_base = float(self.precio)
        if self.en_descuento_hoy:
            return round(precio_base * (1 - float(self.descuento_porcentaje) / 100), 2)
        return precio_base


class Usuario(Base):
    """
    Cuenta de acceso al sistema (clientes y empleado).

    'rol' es la pieza clave: distingue entre un cliente normal (solo puede comprar)
    y el empleado (que ademas puede administrar el inventario). El endpoint de
    registro publico SIEMPRE crea cuentas con rol "cliente" -- el rol "empleado"
    no se puede pedir desde un formulario, solo se asigna manualmente en la base
    de datos, para que nadie pueda auto-otorgarse permisos de administrador.
    """
    __tablename__ = "usuarios"

    id = Column(Integer, primary_key=True, index=True)
    usuario = Column(String, unique=True, index=True, nullable=False)
    password = Column(String, nullable=False)  # nunca texto plano: siempre el hash (ver crud.py)
    rol = Column(String, nullable=False, default="cliente")
    creado_en = Column(DateTime(timezone=True), server_default=func.now())
