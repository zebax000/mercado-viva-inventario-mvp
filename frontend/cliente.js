/* ===== Logica especifica de la vista de cliente (catalogo + carrito) ===== */

let PRODUCTOS_CACHE = [];

document.addEventListener("DOMContentLoaded", () => {
  cargarCatalogo();
  render_carrito();

  document.getElementById("btn-abrir-carrito").addEventListener("click", abrirCarrito);
  document.getElementById("btn-cerrar-carrito").addEventListener("click", cerrarCarrito);
  document.getElementById("overlay").addEventListener("click", cerrarCarrito);
  document.getElementById("btn-confirmar-compra").addEventListener("click", confirmarCompra);
  document.getElementById("input-buscar").addEventListener("input", (e) => {
    filtrarYRenderizarCatalogo(e.target.value);
  });
});

/* ===== Catalogo ===== */

async function cargarCatalogo() {
  const mensajeEl = document.getElementById("catalogo-mensaje");
  const gridEl = document.getElementById("grid-productos");
  mensajeEl.hidden = true;

  try {
    PRODUCTOS_CACHE = await apiFetch("/productos");
    renderizarCatalogo(PRODUCTOS_CACHE);
  } catch (error) {
    gridEl.innerHTML = "";
    mensajeEl.hidden = false;
    mensajeEl.textContent = error.codigoError === "INVENTARIO_VACIO"
      ? "Todavia no hay productos publicados en el catálogo."
      : `No se pudo cargar el catálogo: ${error.message}`;
  }
}

function filtrarYRenderizarCatalogo(texto) {
  const busqueda = texto.trim().toLowerCase();
  const filtrados = !busqueda
    ? PRODUCTOS_CACHE
    : PRODUCTOS_CACHE.filter((p) =>
        p.nombre.toLowerCase().includes(busqueda) || p.codigo.toLowerCase().includes(busqueda)
      );
  renderizarCatalogo(filtrados);
}

function renderizarCatalogo(productos) {
  const gridEl = document.getElementById("grid-productos");
  const tpl = document.getElementById("tpl-tarjeta-producto");
  gridEl.innerHTML = "";

  productos.forEach((producto) => {
    const nodo = tpl.content.cloneNode(true);
    const card = nodo.querySelector(".card-producto");
    const img = nodo.querySelector(".card-producto__img");
    const nombre = nodo.querySelector(".card-producto__nombre");
    const precio = nodo.querySelector(".card-producto__precio");
    const stock = nodo.querySelector(".card-producto__stock");
    const btnAgregar = nodo.querySelector(".btn-agregar");

    img.src = producto.imagen_url || "img/placeholder.png";
    img.alt = producto.nombre;
    nombre.textContent = producto.nombre;
    precio.textContent = formatearPrecio(producto.precio);

    const agotado = producto.stock === 0;
    const bajo = producto.stock > 0 && producto.stock <= 5;

    stock.textContent = agotado ? "Sin stock" : `Stock: ${producto.stock}`;
    if (bajo) stock.classList.add("card-producto__stock--bajo");
    if (agotado) card.classList.add("card-producto--agotado");

    btnAgregar.disabled = agotado;
    btnAgregar.textContent = agotado ? "Agotado" : "Agregar al carrito";
    btnAgregar.addEventListener("click", () => {
      render_carrito(agregarAlCarrito(producto));
      animarIconoCarrito();
      mostrarToast(`${producto.nombre} agregado al carrito`, "exito");
    });

    gridEl.appendChild(nodo);
  });
}

/* ===== Animacion del icono de carrito ===== */

function animarIconoCarrito() {
  const icono = document.getElementById("btn-abrir-carrito");
  const contador = document.getElementById("contador-carrito");
  icono.classList.remove("animando");
  contador.classList.remove("animando");
  requestAnimationFrame(() => {
    icono.classList.add("animando");
    contador.classList.add("animando");
  });
  setTimeout(() => {
    icono.classList.remove("animando");
    contador.classList.remove("animando");
  }, 420);
}

/* ===== Carrito: render y eventos ===== */

function render_carrito(carritoOpcional) {
  const carrito = carritoOpcional || obtenerCarrito();
  const listaEl = document.getElementById("lista-carrito");
  const vacioEl = document.getElementById("carrito-vacio");
  const totalEl = document.getElementById("carrito-total");
  const contadorEl = document.getElementById("contador-carrito");
  const btnConfirmar = document.getElementById("btn-confirmar-compra");
  const tpl = document.getElementById("tpl-item-carrito");

  listaEl.innerHTML = "";
  vacioEl.hidden = carrito.length > 0;
  btnConfirmar.disabled = carrito.length === 0;

  carrito.forEach((item) => {
    const nodo = tpl.content.cloneNode(true);
    nodo.querySelector(".item-carrito__img").src = item.imagen_url || "img/placeholder.png";
    nodo.querySelector(".item-carrito__nombre").textContent = item.nombre;
    nodo.querySelector(".item-carrito__precio-unit").textContent = formatearPrecio(item.precio);
    nodo.querySelector(".item-carrito__cantidad-valor").textContent = item.cantidad;

    nodo.querySelector(".btn-restar").addEventListener("click", () => {
      render_carrito(cambiarCantidad(item.codigo, -1));
    });
    nodo.querySelector(".btn-sumar").addEventListener("click", () => {
      render_carrito(cambiarCantidad(item.codigo, 1));
    });
    nodo.querySelector(".btn-quitar").addEventListener("click", () => {
      render_carrito(quitarDelCarrito(item.codigo));
    });

    listaEl.appendChild(nodo);
  });

  const total = totalCarrito(carrito);
  totalEl.textContent = formatearPrecio(total);

  const totalUnidades = carrito.reduce((acc, i) => acc + i.cantidad, 0);
  contadorEl.textContent = totalUnidades;
}

function abrirCarrito() {
  document.getElementById("panel-carrito").classList.add("abierto");
  document.getElementById("panel-carrito").setAttribute("aria-hidden", "false");
  document.getElementById("overlay").hidden = false;
}

function cerrarCarrito() {
  document.getElementById("panel-carrito").classList.remove("abierto");
  document.getElementById("panel-carrito").setAttribute("aria-hidden", "true");
  document.getElementById("overlay").hidden = true;
}

/* ===== Overlay de confirmacion de compra (check animado) ===== */

function mostrarConfirmacionCompra() {
  let overlay = document.getElementById("confirmacion-overlay");

  if (!overlay) {
    overlay = document.createElement("div");
    overlay.id = "confirmacion-overlay";
    overlay.className = "confirmacion-overlay";
    overlay.innerHTML = `
      <div class="confirmacion-card">
        <div class="confirmacion-check">
          <svg viewBox="0 0 24 24"><path d="M4 12.5l5 5L20 6"/></svg>
        </div>
        <p class="confirmacion-titulo">¡Compra simulada realizada!</p>
        <p class="confirmacion-texto">Gracias por tu compra en Mercado VIVA.</p>
      </div>
    `;
    document.body.appendChild(overlay);
    overlay.addEventListener("click", () => overlay.classList.remove("visible"));
  }

  requestAnimationFrame(() => overlay.classList.add("visible"));
  setTimeout(() => overlay.classList.remove("visible"), 2200);
}

/* ===== Checkout simulado ===== */

async function confirmarCompra() {
  const carrito = obtenerCarrito();
  if (carrito.length === 0) return;

  const btn = document.getElementById("btn-confirmar-compra");
  btn.disabled = true;
  btn.textContent = "Procesando...";

  try {
    for (const item of carrito) {
      await apiFetch(`/productos/${item.codigo}/stock/ajuste`, {
        method: "POST",
        body: JSON.stringify({ tipo_operacion: "venta", cantidad: item.cantidad }),
      });
    }

    vaciarCarrito();
    render_carrito();
    cerrarCarrito();
    mostrarConfirmacionCompra();
    cargarCatalogo(); // refresca el stock visible en el catalogo
  } catch (error) {
    mostrarToast(`No se pudo completar la compra: ${error.message}`, "error");
  } finally {
    btn.disabled = false;
    btn.textContent = "Confirmar compra";
  }
}

/* ===== Sesion de usuario (cliente/empleado) ===== */

const SESION_KEY = "mercadoviva_sesion";
let MODO_MODAL_CUENTA = "login"; // "login" | "registro"

function obtenerSesion() {
  try {
    return JSON.parse(sessionStorage.getItem(SESION_KEY));
  } catch {
    return null;
  }
}

function guardarSesion(sesion) {
  sessionStorage.setItem(SESION_KEY, JSON.stringify(sesion));
  actualizarUISesion();
}

function cerrarSesion() {
  sessionStorage.removeItem(SESION_KEY);
  actualizarUISesion();
  mostrarToast("Sesión cerrada", "info");
}

function actualizarUISesion() {
  const sesion = obtenerSesion();
  const btnCuenta = document.getElementById("btn-cuenta");
  const linkEmpleado = document.getElementById("link-acceso-empleado");
  if (!btnCuenta || !linkEmpleado) return;

  if (sesion) {
    btnCuenta.textContent = `Hola, ${sesion.usuario} · Salir`;
    linkEmpleado.hidden = sesion.rol !== "empleado";
  } else {
    btnCuenta.textContent = "Iniciar sesión";
    linkEmpleado.hidden = true;
  }
}

function abrirModalCuenta() {
  const sesion = obtenerSesion();
  if (sesion) {
    cerrarSesion();
    return;
  }
  cambiarModoModalCuenta("login");
  document.getElementById("modal-cuenta").hidden = false;
}

function cerrarModalCuenta() {
  document.getElementById("modal-cuenta").hidden = true;
  document.getElementById("form-cuenta").reset();
  document.getElementById("error-modal-cuenta").textContent = "";
}

function cambiarModoModalCuenta(modo) {
  MODO_MODAL_CUENTA = modo;
  const esLogin = modo === "login";
  document.getElementById("titulo-modal-cuenta").textContent = esLogin ? "Iniciar sesión" : "Crear cuenta";
  document.getElementById("btn-enviar-cuenta").textContent = esLogin ? "Iniciar sesión" : "Crear cuenta";
  document.getElementById("error-modal-cuenta").textContent = "";
  document.getElementById("tab-login").classList.toggle("btn-primario", esLogin);
  document.getElementById("tab-login").classList.toggle("btn-secundario", !esLogin);
  document.getElementById("tab-registro").classList.toggle("btn-primario", !esLogin);
  document.getElementById("tab-registro").classList.toggle("btn-secundario", esLogin);
}

async function enviarFormularioCuenta(evento) {
  evento.preventDefault();
  const usuario = document.getElementById("input-usuario-cuenta").value.trim();
  const password = document.getElementById("input-password-cuenta").value;
  const errorEl = document.getElementById("error-modal-cuenta");
  const btnEnviar = document.getElementById("btn-enviar-cuenta");
  errorEl.textContent = "";

  if (!usuario || !password) {
    errorEl.textContent = "Usuario y contraseña son obligatorios.";
    return;
  }

  const ruta = MODO_MODAL_CUENTA === "login" ? "/usuarios/login" : "/usuarios/registro";
  btnEnviar.disabled = true;

  try {
    const resultado = await apiFetch(ruta, {
      method: "POST",
      body: JSON.stringify({ usuario, password }),
    });
    guardarSesion(resultado); // { usuario, rol }
    cerrarModalCuenta();
    mostrarToast(
      MODO_MODAL_CUENTA === "login" ? `Bienvenido, ${resultado.usuario}` : "Cuenta creada con éxito",
      "exito"
    );
  } catch (error) {
    errorEl.textContent = error.message || "No se pudo completar la operación.";
  } finally {
    btnEnviar.disabled = false;
  }
}

document.addEventListener("DOMContentLoaded", () => {
  actualizarUISesion();
  document.getElementById("btn-cuenta").addEventListener("click", abrirModalCuenta);
  document.getElementById("btn-cancelar-cuenta").addEventListener("click", cerrarModalCuenta);
  document.getElementById("tab-login").addEventListener("click", () => cambiarModoModalCuenta("login"));
  document.getElementById("tab-registro").addEventListener("click", () => cambiarModoModalCuenta("registro"));
  document.getElementById("form-cuenta").addEventListener("submit", enviarFormularioCuenta);
});
