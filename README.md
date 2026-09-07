# Mercado VIVA — MVP de Inventario

MVP funcional de **consulta y actualización de inventario** para Mercado VIVA. Resuelve la descoordinación entre el stock publicado en canales digitales (web/app) y el stock real de tienda física, que actualmente genera cancelaciones de compras.

Proyecto académico y experimental, construido para aprender el ciclo completo de diseño (BPMN, historias de usuario), implementación (API + base de datos + frontend) y despliegue gratuito.

## Problema

Mercado VIVA tiene tres canales (tienda física, web, app) pero solo el punto de venta físico descuenta stock al momento de la venta. Los canales digitales no reflejan el stock real, causando compras de productos ya agotados.

## Alcance del MVP

**Incluido:**
- Consulta de stock de un producto.
- Actualización de stock por venta, reposición o corrección manual.
- Listado general de inventario.

**Excluido explícitamente:**
- Autenticación de usuarios con roles y permisos.
- Sincronización automática con un POS físico real.
- Manejo de condiciones de carrera por compras simultáneas.
- Notificaciones automáticas de stock bajo.
- Pagos, envíos o cualquier flujo de e-commerce ajeno al inventario.

## Historias de usuario

| ID | Historia |
|---|---|
| HU1 | Como cliente, quiero consultar el stock disponible de un producto, para saber si puedo comprarlo. |
| HU2 | Como empleado, quiero registrar una venta que descuente stock, validando que haya suficiente disponible. |
| HU3 | Como empleado, quiero registrar una reposición que incremente el stock. |
| HU4 | Como empleado, quiero ver un listado general de inventario con el stock actual de todos los productos. |
| HU5 | Como empleado, quiero corregir manualmente el stock de un producto tras un conteo físico. |

## Arquitectura y stack

- **Frontend:** HTML, CSS y JavaScript puro, desplegado en Vercel.
- **Backend:** FastAPI (Python), desplegado en Render.
- **Base de datos:** PostgreSQL gestionado en Neon.
- **Comunicación:** API REST en JSON entre frontend y backend.

## Estructura del repositorio

```
mercado-viva-inventario-mvp/
├── backend/
│   ├── app/
│   │   ├── main.py        # Instancia de FastAPI, routers, CORS
│   │   ├── models.py      # Modelo SQLAlchemy: Producto
│   │   ├── schemas.py     # Esquemas Pydantic de entrada/salida
│   │   ├── database.py    # Conexión a la base de datos (Neon)
│   │   └── crud.py        # Lógica de consulta, actualización y listado
│   ├── tests/
│   │   ├── conftest.py        # Fixture de BD de prueba (SQLite en memoria)
│   │   └── test_productos.py  # Pruebas de flujo exitoso y caso excepcional
│   ├── requirements.txt
│   └── .env.example
├── frontend/
│   ├── index.html   # Vistas de consulta, actualización y listado
│   ├── style.css
│   └── script.js     # Llamadas fetch() a la API
└── docs/
    └── bpmn/         # Diagrama BPMN del proceso (imagen/xml de Bizagi)
```

## Endpoints de la API

| Método | Ruta | Historias que cubre |
|---|---|---|
| `GET` | `/productos/{codigo}` | HU1 — Consulta |
| `POST` | `/productos/{codigo}/stock/ajuste` | HU2, HU3, HU5 — Actualizar stock |
| `GET` | `/productos` | HU4 — Listado |

Formato de error consistente en todos los endpoints:

```json
{ "error": "STOCK_INSUFICIENTE", "mensaje": "No hay suficiente stock disponible" }
```

Documentación interactiva generada automáticamente por FastAPI en `/docs` (Swagger UI).

## Base de datos

La tabla `productos` se crea automáticamente al arrancar la aplicación mediante `Base.metadata.create_all()`. No se usa Alembic ni migraciones versionadas en este MVP, dado el alcance de una sola tabla.

## Cómo correr el proyecto localmente

```bash
cd backend
python -m venv venv
source venv/bin/activate   # En Windows: venv\Scripts\activate
pip install -r requirements.txt
cp .env.example .env       # completar con la URL de la base de datos
uvicorn app.main:app --reload
```

El frontend (`frontend/index.html`) se puede abrir directamente en el navegador o servirse con cualquier servidor estático.

## Cómo correr las pruebas

```bash
cd backend
pytest
```

## Despliegue

- **Backend:** Render (free web service), conectado a este repositorio, con la variable de entorno `DATABASE_URL`.
- **Base de datos:** Neon (PostgreSQL free tier).
- **Frontend:** Vercel, conectado a la carpeta `frontend/`.

## Diagrama BPMN

El proceso está modelado con 3 flujos: consulta, actualización de stock (venta/reposición/corrección unificadas) y listado. El archivo se encuentra en `docs/bpmn/`.

## Licencia

Este proyecto está bajo la licencia MIT. Ver [LICENSE](LICENSE).
