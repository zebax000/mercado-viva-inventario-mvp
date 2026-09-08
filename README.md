# Mercado VIVA — MVP de Inventario

MVP funcional de consulta y actualizacion de inventario para Mercado VIVA. Resuelve la descoordinacion entre el stock publicado en canales digitales (web/app) y el stock real de tienda fisica, que actualmente genera cancelaciones de compras.

Proyecto academico y experimental, construido para aprender el ciclo completo de diseno (BPMN, historias de usuario), implementacion (API + base de datos + frontend) y despliegue gratuito.

## Problema

Mercado VIVA tiene tres canales (tienda fisica, web, app) pero solo el punto de venta fisico descuenta stock al momento de la venta. Los canales digitales no reflejan el stock real, causando compras de productos ya agotados.

## Alcance del MVP

**Incluido:**
- Consulta de stock de un producto.
- Listado general de inventario.
- Registro de productos nuevos, edicion y eliminacion (CRUD completo) desde el panel de empleado.
- Actualizacion de stock por venta, reposicion o correccion manual.
- Acceso al panel de empleado protegido por un codigo compartido simple (no es autenticacion con roles ni usuarios individuales).

**Excluido explicitamente:**
- Autenticacion de usuarios con roles y permisos.
- Sincronizacion automatica con un POS fisico real.
- Manejo de condiciones de carrera por compras simultaneas.
- Notificaciones automaticas de stock bajo.
- Pagos, envios o cualquier flujo de e-commerce ajeno al inventario (el checkout del catalogo es simulado).

## Historias de usuario

| ID | Historia |
|----|----------|
| HU1 | Como cliente, quiero consultar el stock disponible de un producto, para saber si puedo comprarlo. |
| HU2 | Como empleado, quiero registrar una venta que descuente stock, validando que haya suficiente disponible. |
| HU3 | Como empleado, quiero registrar una reposicion que incremente el stock. |
| HU4 | Como empleado, quiero ver un listado general de inventario con el stock actual de todos los productos. |
| HU5 | Como empleado, quiero corregir manualmente el stock de un producto tras un conteo fisico. |
| HU6 | Como empleado, quiero crear, editar y eliminar productos del catalogo, para mantener el inventario actualizado. |

## Arquitectura y stack

- **Frontend:** HTML, CSS y JavaScript puro, desplegado en Vercel.
- **Backend:** FastAPI (Python), desplegado en Render.
- **Base de datos:** PostgreSQL gestionado en Neon.
- **Comunicacion:** API REST en JSON entre frontend y backend.

## Estructura del repositorio

```
mercado-viva-inventario-mvp/
├── backend/
│   ├── app/
│   │   ├── main.py        # Instancia de FastAPI, rutas, CORS
│   │   ├── models.py      # Modelo SQLAlchemy: Producto
│   │   ├── schemas.py     # Esquemas Pydantic de entrada/salida
│   │   ├── database.py    # Conexion a la base de datos (Neon)
│   │   └── crud.py        # Logica de negocio: consulta, CRUD, ajuste de stock, acceso
│   ├── tests/
│   │   ├── conftest.py        # Fixtures de BD de prueba (SQLite en memoria) y TestClient
│   │   └── test_productos.py  # Pruebas de flujo exitoso y casos excepcionales
│   ├── requirements.txt
│   └── .env.example
├── frontend/
│   ├── index.html    # Catalogo publico: busqueda, tarjetas de producto, carrito simulado
│   ├── empleado.html # Acceso por codigo + panel CRUD de inventario
│   ├── style.css
│   ├── script.js     # Logica del catalogo (fetch, carrito, checkout simulado)
│   ├── cliente.js    # Animaciones y overlay de confirmacion de compra
│   └── empleado.js   # Logica del panel de empleado (CRUD, reponer stock, validaciones de input)
└── docs/
    └── bpmn/         # Diagrama BPMN del proceso (imagen/xml de Bizagi)
```

## Endpoints de la API

| Metodo | Ruta | Descripcion | Historias que cubre |
|--------|------|-------------|----------------------|
| GET | `/productos/{codigo}` | Consultar un producto | HU1 |
| GET | `/productos` | Listado general de inventario | HU4 |
| POST | `/productos` | Crear un producto nuevo | HU6 |
| PUT | `/productos/{codigo}` | Editar nombre, precio o imagen de un producto | HU6 |
| DELETE | `/productos/{codigo}` | Eliminar un producto | HU6 |
| POST | `/productos/{codigo}/stock/ajuste` | Ajustar stock: `venta`, `reposicion` o `correccion` | HU2, HU3, HU5 |
| POST | `/empleado/verificar` | Validar el codigo de acceso al panel de empleado | — |

Formato de error consistente en todos los endpoints:

```json
{ "error": "STOCK_INSUFICIENTE", "mensaje": "No hay suficiente stock disponible" }
```

Codigos de error que puede devolver la API:

| Codigo | Cuando ocurre |
|--------|----------------|
| `PRODUCTO_NO_ENCONTRADO` | El codigo de producto consultado, editado o eliminado no existe. |
| `INVENTARIO_VACIO` | Se pide el listado y no hay productos registrados. |
| `CODIGO_DUPLICADO` | Se intenta crear un producto con un codigo que ya existe. |
| `CANTIDAD_INVALIDA` | Un ajuste de tipo venta o reposicion trae una cantidad <= 0. |
| `STOCK_INSUFICIENTE` | Una venta pide descontar mas unidades de las que hay en stock. |
| `CODIGO_INCORRECTO` | El codigo de acceso al panel de empleado no coincide. |
| `CONFIGURACION_INVALIDA` | El servidor no tiene configurada la variable `EMPLEADO_CODIGO`. |

Documentacion interactiva generada automaticamente por FastAPI en `/docs` (Swagger UI).

## Base de datos

La tabla `productos` se crea automaticamente al arrancar la aplicacion mediante `Base.metadata.create_all()`. No se usa Alembic ni migraciones versionadas en este MVP, dado el alcance de una sola tabla.

## Variables de entorno

| Variable | Uso |
|----------|-----|
| `DATABASE_URL` | Cadena de conexion a la base de datos PostgreSQL (Neon). |
| `EMPLEADO_CODIGO` | Codigo compartido que valida el acceso al panel de empleado. |

## Como correr el proyecto localmente

```bash
cd backend
python -m venv venv
source venv/bin/activate   # En Windows: venv\Scripts\activate
pip install -r requirements.txt
cp .env.example .env       # completar con DATABASE_URL y EMPLEADO_CODIGO
uvicorn app.main:app --reload
```

El frontend (`frontend/index.html` y `frontend/empleado.html`) se puede abrir directamente en el navegador o servirse con cualquier servidor estatico.

## Como correr las pruebas

```bash
cd backend
pytest
```

Las pruebas usan una base de datos SQLite en memoria (no tocan la base de datos real de Neon) y cubren el flujo exitoso completo (crear, consultar, vender, reponer, corregir, listar, editar, eliminar y acceso de empleado) junto con los casos excepcionales de cada regla de negocio.

## Despliegue

- **Backend:** Render (free web service), conectado a este repositorio, con las variables de entorno `DATABASE_URL` y `EMPLEADO_CODIGO`.
- **Base de datos:** Neon (PostgreSQL free tier).
- **Frontend:** Vercel, conectado a la carpeta `frontend/`.

## Diagrama BPMN

El proceso esta modelado con los flujos de consulta, actualizacion de stock (venta/reposicion/correccion unificadas), listado y CRUD de productos. El archivo se encuentra en `docs/bpmn/`.

## Licencia

Este proyecto esta bajo la licencia MIT. Ver [LICENSE](https://github.com/zebax000/mercado-viva-inventario-mvp/blob/main/LICENSE).
