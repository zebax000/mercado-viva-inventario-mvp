from fastapi import FastAPI, Depends, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.orm import Session

from app.database import engine, Base, get_db
from app import crud, schemas

Base.metadata.create_all(bind=engine)

app = FastAPI(title="Mercado VIVA - Inventario")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # reemplazar por la URL real de Vercel al desplegar
    allow_methods=["GET", "POST"],
    allow_headers=["*"],
)


@app.get("/productos/{codigo}", response_model=schemas.ProductoOut)
def obtener_producto(codigo: str, db: Session = Depends(get_db)):
    try:
        return crud.consultar_producto(db, codigo)
    except crud.ErrorDeNegocio as e:
        raise HTTPException(status_code=404, detail={"error": e.codigo_error, "mensaje": e.mensaje})


@app.get("/productos", response_model=list[schemas.ProductoOut])
def obtener_listado(db: Session = Depends(get_db)):
    try:
        return crud.listar_productos(db)
    except crud.ErrorDeNegocio as e:
        raise HTTPException(status_code=404, detail={"error": e.codigo_error, "mensaje": e.mensaje})


@app.post("/productos/{codigo}/stock/ajuste", response_model=schemas.ProductoOut)
def ajustar_stock(codigo: str, datos: schemas.AjusteStockIn, db: Session = Depends(get_db)):
    try:
        return crud.ajustar_stock(db, codigo, datos)
    except crud.ErrorDeNegocio as e:
        status = 404 if e.codigo_error == "PRODUCTO_NO_ENCONTRADO" else 400
        raise HTTPException(status_code=status, detail={"error": e.codigo_error, "mensaje": e.mensaje})
