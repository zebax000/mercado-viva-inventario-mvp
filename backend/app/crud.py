import binascii
import hashlib
import hmac
import os

from sqlalchemy.orm import Session

from app.models import Producto, Usuario
from app.schemas import (
    AjusteStockIn,
    DatosEntregaIn,
    ProductoCreateIn,
    ProductoUpdateIn,
    UsuarioLoginIn,
    UsuarioRegistroIn,
)


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
    """Sistema anterior de acceso (variable de entorno). Se mantiene por compatibilidad
    mientras el frontend termina de migrar al login con usuario+contrasena."""
    if not codigo_real:
        raise ErrorDeNegocio(
            "CONFIGURACION_INVALIDA",
            "No hay codigo de empleado configurado en el servidor",
        )
    if codigo_ingresado != codigo_real:
        raise ErrorDeNegocio("CODIGO_INCORRECTO", "El codigo de acceso no es valido")


# ============================================================
# Usuarios: registro y login con contrasena hasheada
# ============================================================
#
# Usamos PBKDF2 (hashlib.pbkdf2_hmac), que viene incluido en la libreria
# estandar de Python -- no requiere instalar bcrypt ni passlib. La idea es
# que la contrasena JAMAS se guarda tal cual: se combina con una "sal"
# aleatoria distinta por usuario y se aplican 260,000 vueltas de SHA-256,
# para que ni robando la base de datos se pueda recuperar la contrasena
# original ni sea practico probarlas todas por fuerza bruta.

ITERACIONES_HASH = 260_000


def hash_password(password: str) -> str:
    """Genera una sal aleatoria, calcula el hash PBKDF2 y devuelve ambos
    juntos como 'sal_en_hex$hash_en_hex' para poder repetir el calculo despues."""
    sal = os.urandom(16)
    hash_bytes = hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), sal, ITERACIONES_HASH)
    return f"{binascii.hexlify(sal).decode()}${binascii.hexlify(hash_bytes).decode()}"


def verificar_password(password: str, password_guardado: str) -> bool:
    """Repite el calculo de hash_password() usando la sal ya guardada, y compara
    el resultado con hmac.compare_digest en vez de '==' -- esto evita 'timing attacks',
    donde alguien podria medir cuanto tarda la comparacion para adivinar la contrasena
    caracter por caracter."""
    try:
        sal_hex, hash_hex = password_guardado.split("$")
    except ValueError:
        return False
    sal = binascii.unhexlify(sal_hex)
    hash_esperado = binascii.unhexlify(hash_hex)
    hash_calculado = hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), sal, ITERACIONES_HASH)
    return hmac.compare_digest(hash_calculado, hash_esperado)


def registrar_usuario(db: Session, datos: UsuarioRegistroIn) -> Usuario:
    """Crea una cuenta de cliente nueva. El rol siempre queda en 'cliente': el
    formulario publico nunca puede crear una cuenta con permisos de empleado."""
    existe = db.query(Usuario).filter(Usuario.usuario == datos.usuario).first()
    if existe is not None:
        raise ErrorDeNegocio("USUARIO_DUPLICADO", "Ese nombre de usuario ya esta en uso")

    usuario = Usuario(
        usuario=datos.usuario,
        password=hash_password(datos.password),
        rol="cliente",
    )
    db.add(usuario)
    db.commit()
    db.refresh(usuario)
    return usuario


def iniciar_sesion(db: Session, datos: UsuarioLoginIn) -> Usuario:
    """Valida usuario + contrasena. Si cualquiera de los dos falla, se devuelve
    SIEMPRE el mismo error generico (CREDENCIALES_INVALIDAS) a proposito: decir
    'el usuario no existe' vs 'la contrasena esta mal' le daria pistas a alguien
    intentando adivinar cuentas validas."""
    usuario = db.query(Usuario).filter(Usuario.usuario == datos.usuario).first()
    if usuario is None or not verificar_password(datos.password, usuario.password):
        raise ErrorDeNegocio("CREDENCIALES_INVALIDAS", "Usuario o contrasena incorrectos")
    return usuario


def actualizar_datos_entrega(db: Session, usuario_nombre: str, datos: DatosEntregaIn) -> Usuario:
    """Guarda o actualiza el nombre, telefono y direccion de un cliente ya
    autenticado, para que no tenga que rellenarlos de nuevo en su siguiente compra."""
    usuario = db.query(Usuario).filter(Usuario.usuario == usuario_nombre).first()
    if usuario is None:
        raise ErrorDeNegocio("USUARIO_NO_ENCONTRADO", "El usuario no existe")

    if datos.nombre_completo is not None:
        usuario.nombre_completo = datos.nombre_completo
    if datos.telefono is not None:
        usuario.telefono = datos.telefono
    if datos.direccion is not None:
        usuario.direccion = datos.direccion

    db.commit()
    db.refresh(usuario)
    return usuario
