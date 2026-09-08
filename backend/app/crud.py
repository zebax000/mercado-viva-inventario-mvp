from sqlalchemy.orm import Session

from app.models import Producto
from app.schemas import AjusteStockIn, ProductoCreateIn, ProductoUpdateIn


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


def listar_productos(
    db: Session,
    categoria: str | None = None,
    subcategoria: str | None = None,
) -> list[Producto]:
    consulta = db.query(Producto)
    if categoria:
        consulta = consulta.filter(Producto.categoria == categoria)
    if subcategoria:
        consulta = consulta.filter(Producto.subcategoria == subcategoria)

    productos = consulta.all()
    if not productos:
        raise ErrorDeNegocio("INVENTARIO_VACIO", "No hay productos registrados")
    return productos


def crear_producto(db: Session, datos: ProductoCreateIn) -> Producto:
    existe = db.query(Producto).filter(Producto.codigo == datos.codigo).first()
    if existe is not None:
        raise ErrorDeNegocio("CODIGO_DUPLICADO", "Ya existe un producto con ese codigo")

    producto = Producto(
        codigo=datos.codigo,
        nombre=datos.nombre,
        stock=datos.stock,
        precio=datos.precio,
        imagen_url=datos.imagen_url,
        categoria=datos.categoria,
        subcategoria=datos.subcategoria,
        descuento_porcentaje=datos.descuento_porcentaje,
        dias_descuento=datos.dias_descuento,
    )
    db.add(producto)
    db.commit()
    db.refresh(producto)
    return producto


def actualizar_producto(db: Session, codigo: str, datos: ProductoUpdateIn) -> Producto:
    producto = consultar_producto(db, codigo)

    if datos.nombre is not None:
        producto.nombre = datos.nombre
    if datos.precio is not None:
        producto.precio = datos.precio
    if datos.imagen_url is not None:
        producto.imagen_url = datos.imagen_url
    if datos.categoria is not None:
        producto.categoria = datos.categoria
    if datos.subcategoria is not None:
        producto.subcategoria = datos.subcategoria
    if datos.descuento_porcentaje is not None:
        producto.descuento_porcentaje = datos.descuento_porcentaje
    if datos.dias_descuento is not None:
        producto.dias_descuento = datos.dias_descuento

    db.commit()
    db.refresh(producto)
    return producto


def eliminar_producto(db: Session, codigo: str) -> None:
    producto = consultar_producto(db, codigo)
    db.delete(producto)
    db.commit()


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


def verificar_codigo_empleado(codigo_ingresado: str, codigo_real: str | None) -> None:
    if not codigo_real:
        raise ErrorDeNegocio(
            "CONFIGURACION_INVALIDA",
            "No hay codigo de empleado configurado en el servidor",
        )
    if codigo_ingresado != codigo_real:
        raise ErrorDeNegocio("CODIGO_INCORRECTO", "El codigo de acceso no es valido")
