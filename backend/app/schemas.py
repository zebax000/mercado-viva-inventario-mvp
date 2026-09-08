from typing import Literal, Optional
from pydantic import BaseModel, NonNegativeInt, NonNegativeFloat


class ProductoOut(BaseModel):
    """Lo que la API devuelve al consultar o listar un producto."""
    codigo: str
    nombre: str
    stock: int
    precio: float
    imagen_url: Optional[str] = None
    categoria: Optional[str] = None
    subcategoria: Optional[str] = None
    descuento_porcentaje: float = 0
    dias_descuento: Optional[str] = None
    precio_final: float
    en_descuento_hoy: bool

    class Config:
        from_attributes = True


class ProductoCreateIn(BaseModel):
    """Lo que el empleado envia para crear un producto nuevo."""
    codigo: str
    nombre: str
    stock: NonNegativeInt = 0
    precio: NonNegativeFloat = 0
    imagen_url: Optional[str] = None
    categoria: Optional[str] = None
    subcategoria: Optional[str] = None
    descuento_porcentaje: NonNegativeFloat = 0
    dias_descuento: Optional[str] = None


class ProductoUpdateIn(BaseModel):
    """Lo que el empleado envia para editar un producto existente.
    Todos los campos son opcionales: solo se actualiza lo que se envia."""
    nombre: Optional[str] = None
    precio: Optional[NonNegativeFloat] = None
    imagen_url: Optional[str] = None
    categoria: Optional[str] = None
    subcategoria: Optional[str] = None
    descuento_porcentaje: Optional[NonNegativeFloat] = None
    dias_descuento: Optional[str] = None


class AjusteStockIn(BaseModel):
    """Lo que el empleado envia para vender, reponer o corregir stock."""
    tipo_operacion: Literal["venta", "reposicion", "correccion"]
    cantidad: NonNegativeInt


class EmpleadoAccesoIn(BaseModel):
    """Codigo de acceso que el empleado ingresa para entrar al panel."""
    codigo: str


class ErrorResponse(BaseModel):
    """Formato unico de error para toda la API."""
    error: str
    mensaje: str
