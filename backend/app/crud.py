from sqlalchemy.orm import Session

from app.models import Producto
from app.schemas import AjusteStockIn


class ErrorDeNegocio(Exception):
    """Excepcion controlada que main.py traduce al formato {error, mensaje}."""
    def __init__(self, codigo_error: str, mensaje: str):
        self.codigo_error = codigo_error
        self.mensaje = mensaje


def consultar_producto(db: Session, codigo: str) -> Producto:
    producto = db.query(Producto).filter(Producto.codigo == codigo).first()
    if producto is None:
        raise ErrorDeNegocio("PRODUCTO_NO_ENCONTRADO", "El producto no existe")
    return producto


def listar_productos(db: Session) -> list[Producto]:
    productos = db.query(Producto).all()
    if not productos:
        raise ErrorDeNegocio("INVENTARIO_VACIO", "No hay productos registrados")
    return productos


def ajustar_stock(db: Session, codigo: str, datos: AjusteStockIn) -> Producto:
    producto = consultar_producto(db, codigo)

    if datos.tipo_operacion in ("venta", "reposicion") and datos.cantidad <= 0:
        raise ErrorDeNegocio(
            "CANTIDAD_INVALIDA",
            "La cantidad debe ser mayor a 0 para venta o reposicion",
        )

    if datos.tipo_operacion == "venta":
        if datos.cantidad > producto.stock:
            raise ErrorDeNegocio("STOCK_INSUFICIENTE", "No hay suficiente stock disponible")
        producto.stock -= datos.cantidad

    elif datos.tipo_operacion == "reposicion":
        producto.stock += datos.cantidad

    elif datos.tipo_operacion == "correccion":
        producto.stock = datos.cantidad

    db.commit()
    db.refresh(producto)
    return producto
