from typing import Literal
from pydantic import BaseModel, NonNegativeInt


class ProductoOut(BaseModel):
    """Lo que la API devuelve al consultar o listar un producto."""
    codigo: str
    nombre: str
    stock: int

    class Config:
        from_attributes = True


class AjusteStockIn(BaseModel):
    """Lo que el empleado envia para vender, reponer o corregir stock."""
    tipo_operacion: Literal["venta", "reposicion", "correccion"]
    cantidad: NonNegativeInt


class ErrorResponse(BaseModel):
    """Formato unico de error para toda la API."""
    error: str
    mensaje: str
