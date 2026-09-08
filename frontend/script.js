/* ===== Configuracion y funciones compartidas entre cliente.js y empleado.js ===== */

const API_BASE = "http://127.0.0.1:8000";

/**
 * Hace una peticion a la API y normaliza los errores.
 * Si el backend responde con {error, mensaje}, lanza un Error con esa info adjunta.
 */
async function apiFetch(path, opciones = {}) {
  const respuesta = await fetch(`${API_BASE}${path}`, {
    headers: { "Content-Type": "application/json" },
    ...opciones,
  });

  // 204 No Content (ej. DELETE exitoso) no trae cuerpo
  if (respuesta.status === 204) return null;

  const datos = await respuesta.json().catch(() => null);

  if (!respuesta.ok) {
    const detalle = datos && datos.detail ? datos.detail : {};
    const error = new Error(detalle.mensaje || "Ocurrio un error inesperado");
    error.codigoError = detalle.error || "ERROR_DESCONOCIDO";
    error.status = respuesta.status;
    throw error;
  }

  return datos;
}

/* ===== Carrito en localStorage ===== */

const CARRITO_KEY = "mercadoviva_carrito";

function obtenerCarrito() {
  try {
    return JSON.parse(localStorage.getItem(CARRITO_KEY)) || [];
  } catch {
    return [];
  }
}

function guardarCarrito(carrito) {
  localStorage.setItem(CARRITO_KEY, JSON.stringify(carrito));
}

function agregarAlCarrito(producto) {
  const carrito = obtenerCarrito();
  const existente = carrito.find((item) => item.codigo === producto.codigo);

  if (existente) {
    existente.cantidad += 1;
  } else {
    carrito.push({
      codigo: producto.codigo,
      nombre: producto.nombre,
      precio: producto.precio,
      imagen_url: producto.imagen_url,
      cantidad: 1,
    });
  }

  guardarCarrito(carrito);
  return carrito;
}

function cambiarCantidad(codigo, delta) {
  const carrito = obtenerCarrito();
  const item = carrito.find((i) => i.codigo === codigo);
  if (!item) return carrito;

  item.cantidad += delta;

  const carritoFiltrado = item.cantidad <= 0
    ? carrito.filter((i) => i.codigo !== codigo)
    : carrito;

  guardarCarrito(carritoFiltrado);
  return carritoFiltrado;
}

function quitarDelCarrito(codigo) {
  const carrito = obtenerCarrito().filter((i) => i.codigo !== codigo);
  guardarCarrito(carrito);
  return carrito;
}

function vaciarCarrito() {
  guardarCarrito([]);
}

function totalCarrito(carrito) {
  return carrito.reduce((acc, item) => acc + item.precio * item.cantidad, 0);
}

/* ===== Utilidades de formato ===== */

function formatearPrecio(valor) {
  return new Intl.NumberFormat("es-CO", {
    style: "currency",
    currency: "COP",
    maximumFractionDigits: 0,
  }).format(valor);
}

/* ===== Toast de feedback ===== */

function mostrarToast(mensaje, tipo = "info") {
  const toast = document.getElementById("toast");
  if (!toast) return;

  toast.textContent = mensaje;
  toast.className = "toast";
  if (tipo === "error") toast.classList.add("toast--error");
  if (tipo === "exito") toast.classList.add("toast--exito");

  toast.hidden = false;
  clearTimeout(toast._timeout);
  toast._timeout = setTimeout(() => {
    toast.hidden = true;
  }, 3200);
}
