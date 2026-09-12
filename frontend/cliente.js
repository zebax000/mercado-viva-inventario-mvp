/* ===== Logica especifica de la vista de cliente (catalogo + carrito) ===== */

let PRODUCTOS_CACHE = [];
let CATEGORIA_ACTIVA = "";

const UMBRAL_ENVIO_GRATIS = 30000;
const COSTO_ENVIO = 5000;
const DATOS_ENTREGA_KEY = "mercadoviva_datos_entrega";
const PREFERENCIAS_CHECKOUT_KEY = "mercadoviva_preferencias_checkout";

/*
 * Zona de cobertura: Medellín y municipios cercanos del Valle de Aburrá.
 * Este "viewbox" (izquierda, arriba, derecha, abajo) limita la búsqueda
 * de direcciones a esta región, mejorando la precisión frente a una
 * búsqueda global. Si en el futuro se cambia a Google Maps, este valor
 * ya no se usa: Google recibe el sesgo geográfico de otra forma.
 */
const ZONA_COBERTURA_VIEWBOX = "-75.7328,6.1358,-75.4820,6.4189";

let mapaEntrega = null;
let marcadorEntrega = null;
let UBICACION_ENTREGA_CONFIRMABLE = null;
let ULTIMO_ID_TIMEOUT_COLAPSO_MAPA = null;

/*
 * ============================================================
 * Capa de geocodificación (aislada del resto del checkout)
 * ============================================================
 * Estas dos funciones son el ÚNICO lugar que sabe que el proveedor
 * es OpenStreetMap/Nominatim. Si más adelante se reemplaza por
 * Google Maps (Geocoding API / Places), solo hay que reescribir
 * el CONTENIDO de estas dos funciones, manteniendo la misma firma:
 *
 *   geocodificarDireccion(texto) -> { latitud, longitud, direccion }
 *   geocodificarInverso(lat, lon) -> { direccion }
 *
 * Todo el resto de cliente.js (mapa, marcador, validaciones,
 * checkout) seguirá funcionando sin cambios.
 */

async function geocodificarDireccion(direccion) {
  const consulta = new URLSearchParams({
    q: `${direccion}, Medellín, Antioquia, Colombia`,
    format: "jsonv2",
    limit: "1",
    addressdetails: "1",
    "accept-language": "es",
    countrycodes: "co",
    viewbox: ZONA_COBERTURA_VIEWBOX,
    bounded: "1",
  });

  const respuesta = await fetch(
    `https://nominatim.openstreetmap.org/search?${consulta.toString()}`
  );

  if (!respuesta.ok) {
    throw new Error("El servicio de mapas no respondió correctamente.");
  }

  const resultados = await respuesta.json();

  if (!resultados.length) {
    throw new Error(
      "No encontramos esa dirección en Medellín. Añade barrio, comuna o un punto de referencia."
    );
  }

  const resultado = resultados[0];

  return {
    latitud: Number(resultado.lat),
    longitud: Number(resultado.lon),
    direccion: resultado.display_name,
  };
}

async function geocodificarInverso(latitud, longitud) {
  const consulta = new URLSearchParams({
    lat: String(latitud),
    lon: String(longitud),
    format: "jsonv2",
    "accept-language": "es",
  });

  const respuesta = await fetch(
    `https://nominatim.openstreetmap.org/reverse?${consulta.toString()}`
  );

  if (!respuesta.ok) {
    throw new Error("No fue posible actualizar la dirección.");
  }

  const resultado = await respuesta.json();

  return {
    direccion: resultado.display_name || "Ubicación seleccionada en el mapa",
  };
}

const METODOS_PAGO_LABEL = {
  efectivo: "Efectivo",
  tarjeta: "Tarjeta débito/crédito",
  transferencia: "Transferencia bancaria",
};

document.addEventListener("DOMContentLoaded", () => {
  cargarCatalogo();
  cargarDatosEntregaGuardados();
  cargarPreferenciasCheckout();
  render_carrito();
  inicializarSliderPromociones();

  document.getElementById("btn-abrir-carrito").addEventListener("click", abrirCarrito);
  document.getElementById("btn-cerrar-carrito").addEventListener("click", cerrarCarrito);
  document.getElementById("overlay").addEventListener("click", cerrarCarrito);
  document.getElementById("btn-confirmar-compra").addEventListener("click", confirmarCompra);

  document
    .getElementById("btn-ubicar-direccion")
    .addEventListener("click", ubicarDireccionEnMapa);

  document
    .getElementById("input-direccion-entrega")
    .addEventListener("input", invalidarConfirmacionUbicacion);

  document.querySelectorAll('input[name="metodo-pago"]').forEach((radio) => {
    radio.addEventListener("change", actualizarFormularioPago);
  });

  document
    .getElementById("input-numero-tarjeta")
    .addEventListener("input", formatearNumeroTarjeta);

  document
    .getElementById("input-vencimiento-tarjeta")
    .addEventListener("input", formatearVencimientoTarjeta);

  document
    .getElementById("input-titular-tarjeta")
    .addEventListener("input", actualizarVistaTarjeta);

  document.getElementById("input-buscar").addEventListener("input", () => {
    aplicarFiltrosYRenderizar();
  });

  document.querySelectorAll('input[name="tipo-entrega"]').forEach((radio) => {
    radio.addEventListener("change", () => {
      actualizarVisibilidadDireccion();
      render_carrito();
    });
  });

  document.querySelectorAll("#categorias-bar .btn-categoria").forEach((boton) => {
    boton.addEventListener("click", () => {
      CATEGORIA_ACTIVA = boton.dataset.categoria;
      actualizarEstiloBotonesCategoria();
      aplicarFiltrosYRenderizar();
    });

    const tooltip = boton.parentElement.querySelector(".tooltip-categoria");

    if (tooltip) {
      boton.addEventListener("mouseenter", () => {
        tooltip.style.display = "block";
      });

      boton.addEventListener("mouseleave", () => {
        tooltip.style.display = "none";
      });
    }
  });

  actualizarEstiloBotonesCategoria();
});

/* ===== Catalogo ===== */

async function cargarCatalogo() {
  const mensajeEl = document.getElementById("catalogo-mensaje");
  const gridEl = document.getElementById("grid-productos");

  mensajeEl.hidden = true;

  try {
    PRODUCTOS_CACHE = await apiFetch("/productos");
    aplicarFiltrosYRenderizar();
  } catch (error) {
    gridEl.innerHTML = "";
    mensajeEl.hidden = false;

    mensajeEl.textContent = error.codigoError === "INVENTARIO_VACIO"
      ? "Todavia no hay productos publicados en el catálogo."
      : `No se pudo cargar el catálogo: ${error.message}`;
  }
}

function actualizarEstiloBotonesCategoria() {
  document.querySelectorAll("#categorias-bar .btn-categoria").forEach((boton) => {
    const activo = boton.dataset.categoria === CATEGORIA_ACTIVA;

    boton.style.background = activo ? "var(--acento)" : "var(--blanco)";
    boton.style.color = activo ? "var(--blanco)" : "var(--texto)";
    boton.style.borderColor = activo ? "var(--acento)" : "var(--borde)";
  });
}

function aplicarFiltrosYRenderizar() {
  const busqueda = document.getElementById("input-buscar").value.trim().toLowerCase();

  const filtrados = PRODUCTOS_CACHE.filter((producto) => {
    const coincideTexto = !busqueda
      || producto.nombre.toLowerCase().includes(busqueda)
      || producto.codigo.toLowerCase().includes(busqueda);

    const coincideCategoria = !CATEGORIA_ACTIVA
      || producto.categoria === CATEGORIA_ACTIVA;

    return coincideTexto && coincideCategoria;
  });

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
    const precioOriginal = nodo.querySelector(".card-producto__precio-original");
    const selloDescuento = nodo.querySelector(".sello-descuento");
    const stock = nodo.querySelector(".card-producto__stock");
    const btnAgregar = nodo.querySelector(".btn-agregar");
    const stepperDiv = nodo.querySelector(".stepper-cantidad-card");
    const btnRestarCard = nodo.querySelector(".btn-restar-card");
    const btnSumarCard = nodo.querySelector(".btn-sumar-card");
    const cantidadValorCard = nodo.querySelector(".cantidad-valor-card");

    img.src = producto.imagen_url || "img/placeholder.png";
    img.alt = producto.nombre;
    nombre.textContent = producto.nombre;

    if (producto.en_descuento_hoy) {
      precio.textContent = formatearPrecio(producto.precio_final);
      precioOriginal.textContent = formatearPrecio(producto.precio);
      precioOriginal.style.display = "inline";

      selloDescuento.textContent = `-${Math.round(producto.descuento_porcentaje)}%`;
      selloDescuento.style.display = "inline-block";
    } else {
      precio.textContent = formatearPrecio(producto.precio);
      precioOriginal.style.display = "none";
      selloDescuento.style.display = "none";
    }

    const agotado = producto.stock === 0;
    const bajo = producto.stock > 0 && producto.stock <= 5;

    stock.textContent = agotado ? "Sin stock" : `Stock: ${producto.stock}`;

    if (bajo) {
      stock.classList.add("card-producto__stock--bajo");
    }

    if (agotado) {
      card.classList.add("card-producto--agotado");
    }

    const precioParaCarrito = producto.en_descuento_hoy
      ? producto.precio_final
      : producto.precio;

    let cantidadEnCarrito = 0;

    function mostrarBotonAgregar() {
      cantidadEnCarrito = 0;
      stepperDiv.style.display = "none";
      btnAgregar.style.display = "";
    }

    function mostrarStepper() {
      cantidadValorCard.textContent = cantidadEnCarrito;
      btnAgregar.style.display = "none";
      stepperDiv.style.display = "flex";
    }

    btnAgregar.disabled = agotado;
    btnAgregar.textContent = agotado ? "Agotado" : "Agregar al carrito";

    mostrarBotonAgregar();

    btnAgregar.addEventListener("click", () => {
      const productoParaCarrito = {
        ...producto,
        precio: precioParaCarrito,
      };

      render_carrito(agregarAlCarrito(productoParaCarrito, 1));
      animarIconoCarrito();

      cantidadEnCarrito = 1;
      mostrarStepper();
    });

    btnSumarCard.addEventListener("click", () => {
      if (producto.stock > 0 && cantidadEnCarrito >= producto.stock) {
        return;
      }

      render_carrito(cambiarCantidad(producto.codigo, 1));

      cantidadEnCarrito += 1;
      cantidadValorCard.textContent = cantidadEnCarrito;

      animarIconoCarrito();
    });

    btnRestarCard.addEventListener("click", () => {
      render_carrito(cambiarCantidad(producto.codigo, -1));

      cantidadEnCarrito -= 1;

      if (cantidadEnCarrito <= 0) {
        mostrarBotonAgregar();
      } else {
        cantidadValorCard.textContent = cantidadEnCarrito;
      }
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

/* ===== Envio: calculo segun subtotal y tipo de entrega ===== */

function obtenerTipoEntregaSeleccionado() {
  const radio = document.querySelector('input[name="tipo-entrega"]:checked');

  return radio ? radio.value : "recoleccion";
}

function actualizarVisibilidadDireccion() {
  const esDomicilio = obtenerTipoEntregaSeleccionado() === "domicilio";
  const campoDireccion = document.getElementById("campo-direccion-entrega");

  campoDireccion.hidden = !esDomicilio;

  if (!esDomicilio) {
    limpiarUbicacionEntrega();
  } else {
    setTimeout(() => {
      if (mapaEntrega) {
        mapaEntrega.invalidateSize();
      }
    }, 100);
  }
}

function calcularCostoEnvio(subtotal, tipoEntrega) {
  if (tipoEntrega !== "domicilio") {
    return 0;
  }

  return subtotal < UMBRAL_ENVIO_GRATIS ? COSTO_ENVIO : 0;
}

/* ===== Datos de entrega: precarga y guardado ===== */

function cargarDatosEntregaGuardados() {
  const sesion = obtenerSesion();

  if (sesion && (sesion.nombre_completo || sesion.telefono || sesion.direccion)) {
    aplicarDatosEntregaAlFormulario(sesion);
    return;
  }

  try {
    const guardados = JSON.parse(localStorage.getItem(DATOS_ENTREGA_KEY));

    if (guardados) {
      aplicarDatosEntregaAlFormulario(guardados);
    }
  } catch {
    /* Sin datos guardados: el formulario se mantiene vacío */
  }
}

function aplicarDatosEntregaAlFormulario(datos) {
  if (datos.nombre_completo) {
    document.getElementById("input-nombre-entrega").value = datos.nombre_completo;
  }

  if (datos.telefono) {
    document.getElementById("input-telefono-entrega").value = datos.telefono;
  }

  if (datos.direccion) {
    document.getElementById("input-direccion-entrega").value = datos.direccion;
  }

  if (datos.tipo_entrega === "domicilio") {
    document.getElementById("radio-domicilio").checked = true;
    actualizarVisibilidadDireccion();
  }
}

async function guardarDatosEntrega(datos) {
  const sesion = obtenerSesion();

  if (sesion) {
    try {
      await apiFetch(
        `/usuarios/${encodeURIComponent(sesion.usuario)}/datos-entrega`,
        {
          method: "PUT",
          body: JSON.stringify(datos),
        }
      );
    } catch {
      /* Si falla la persistencia remota, no se interrumpe la compra simulada */
    }
  } else {
    localStorage.setItem(DATOS_ENTREGA_KEY, JSON.stringify(datos));
  }
}

/* ===== Carrito: render y eventos ===== */

function render_carrito(carritoOpcional) {
  const carrito = carritoOpcional || obtenerCarrito();

  const listaEl = document.getElementById("lista-carrito");
  const vacioEl = document.getElementById("carrito-vacio");
  const subtotalEl = document.getElementById("carrito-subtotal");
  const envioEl = document.getElementById("carrito-envio");
  const totalEl = document.getElementById("carrito-total");
  const contadorEl = document.getElementById("contador-carrito");
  const btnConfirmar = document.getElementById("btn-confirmar-compra");
  const tpl = document.getElementById("tpl-item-carrito");

  listaEl.innerHTML = "";
  vacioEl.hidden = carrito.length > 0;
  btnConfirmar.disabled = carrito.length === 0;

  carrito.forEach((item) => {
    const nodo = tpl.content.cloneNode(true);

    nodo.querySelector(".item-carrito__img").src =
      item.imagen_url || "img/placeholder.png";

    nodo.querySelector(".item-carrito__nombre").textContent = item.nombre;
    nodo.querySelector(".item-carrito__precio-unit").textContent =
      formatearPrecio(item.precio);

    nodo.querySelector(".item-carrito__cantidad-valor").textContent =
      item.cantidad;

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

  const subtotal = totalCarrito(carrito);
  const tipoEntrega = obtenerTipoEntregaSeleccionado();
  const costoEnvio = calcularCostoEnvio(subtotal, tipoEntrega);
  const total = subtotal + costoEnvio;

  subtotalEl.textContent = formatearPrecio(subtotal);
  envioEl.textContent = costoEnvio > 0
    ? formatearPrecio(costoEnvio)
    : "Gratis";

  totalEl.textContent = formatearPrecio(total);

  const totalUnidades = carrito.reduce((acumulado, item) => {
    return acumulado + item.cantidad;
  }, 0);

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

/* ===== Confirmacion de compra ===== */

function mostrarConfirmacionCompra(metodoPagoTexto) {
  let overlay = document.getElementById("confirmacion-overlay");

  if (!overlay) {
    overlay = document.createElement("div");
    overlay.id = "confirmacion-overlay";
    overlay.className = "confirmacion-overlay";

    document.body.appendChild(overlay);

    overlay.addEventListener("click", () => {
      overlay.classList.remove("visible");
    });
  }

  overlay.innerHTML = `
    <div class="confirmacion-card">
      <div class="confirmacion-check">
        <svg viewBox="0 0 24 24">
          <path d="M4 12.5l5 5L20 6"/>
        </svg>
      </div>

      <p class="confirmacion-titulo">¡Compra simulada realizada!</p>
      <p class="confirmacion-texto">Gracias por tu compra en Mercado VIVA.</p>

      ${
        metodoPagoTexto
          ? `<p class="confirmacion-texto">Método de pago: ${metodoPagoTexto}</p>`
          : ""
      }
    </div>
  `;

  requestAnimationFrame(() => {
    overlay.classList.add("visible");
  });

  setTimeout(() => {
    overlay.classList.remove("visible");
  }, 2200);
}

/* ===== Checkout simulado ===== */

async function confirmarCompra() {
  const carrito = obtenerCarrito();

  if (carrito.length === 0) {
    return;
  }

  const errorEl = document.getElementById("error-checkout");
  errorEl.textContent = "";

  const nombreCompleto = document
    .getElementById("input-nombre-entrega")
    .value
    .trim();

  const telefono = document
    .getElementById("input-telefono-entrega")
    .value
    .trim();

  const tipoEntrega = obtenerTipoEntregaSeleccionado();
  const direccion = document
    .getElementById("input-direccion-entrega")
    .value
    .trim();

  const metodoPago = obtenerMetodoPagoSeleccionado();

  if (!nombreCompleto || !telefono) {
    errorEl.textContent = "Nombre y teléfono son obligatorios.";
    return;
  }

  if (tipoEntrega === "domicilio" && !direccion) {
    errorEl.textContent = "Ingresa la dirección para el envío a domicilio.";
    return;
  }

  if (tipoEntrega === "domicilio" && !UBICACION_ENTREGA_CONFIRMABLE) {
    errorEl.textContent = "Ubica tu dirección en el mapa antes de continuar.";
    return;
  }

  if (
    tipoEntrega === "domicilio"
    && !document.getElementById("check-confirmar-ubicacion").checked
  ) {
    errorEl.textContent = "Confirma que el marcador corresponde a tu dirección de entrega.";
    return;
  }

  if (!metodoPago) {
    errorEl.textContent = "Selecciona un método de pago.";
    return;
  }

  const errorPago = validarDatosPago(metodoPago);

  if (errorPago) {
    errorEl.textContent = errorPago;
    return;
  }

  const btn = document.getElementById("btn-confirmar-compra");
  btn.disabled = true;
  btn.textContent = "Verificando pago simulado...";

  try {
    await esperar(850);

    for (const item of carrito) {
      await apiFetch(`/productos/${item.codigo}/stock/ajuste`, {
        method: "POST",
        body: JSON.stringify({
          tipo_operacion: "venta",
          cantidad: item.cantidad,
        }),
      });
    }

    await guardarDatosEntrega({
      nombre_completo: nombreCompleto,
      telefono,
      direccion: tipoEntrega === "domicilio" ? direccion : "",
      tipo_entrega: tipoEntrega,
    });

    guardarPreferenciasCheckout({
      tipo_entrega: tipoEntrega,
      metodo_pago_preferido: metodoPago,
    });

    limpiarDatosPagoSensibles();
    vaciarCarrito();
    render_carrito();
    cerrarCarrito();

    mostrarConfirmacionCompra(METODOS_PAGO_LABEL[metodoPago] || "");
    cargarCatalogo();
  } catch (error) {
    mostrarToast(`No se pudo completar la compra: ${error.message}`, "error");
  } finally {
    btn.disabled = false;
    btn.textContent = "Confirmar compra";
  }
}

function esperar(milisegundos) {
  return new Promise((resolver) => setTimeout(resolver, milisegundos));
}

function obtenerMetodoPagoSeleccionado() {
  const radio = document.querySelector('input[name="metodo-pago"]:checked');
  return radio ? radio.value : "";
}

function actualizarFormularioPago() {
  const metodoPago = obtenerMetodoPagoSeleccionado();
  const esTarjeta = metodoPago === "tarjeta";
  const esTransferencia = metodoPago === "transferencia";

  document.getElementById("form-pago-tarjeta").hidden = !esTarjeta;
  document.getElementById("form-pago-transferencia").hidden = !esTransferencia;
  document.getElementById("aviso-pago-simulado").hidden = !metodoPago;

  if (!esTarjeta) {
    limpiarCamposTarjeta();
  }

  if (!esTransferencia) {
    document.getElementById("select-banco-transferencia").selectedIndex = 0;
    document.getElementById("input-referencia-transferencia").value = "";
  }
}

function validarDatosPago(metodoPago) {
  if (metodoPago === "efectivo") {
    return "";
  }

  if (metodoPago === "transferencia") {
    const banco = document.getElementById("select-banco-transferencia").value;
    const referencia = document
      .getElementById("input-referencia-transferencia")
      .value
      .trim();

    if (!banco || !referencia) {
      return "Selecciona el banco e ingresa una referencia de transferencia.";
    }

    if (referencia.length < 4) {
      return "La referencia de transferencia debe tener al menos 4 caracteres.";
    }

    return "";
  }

  const titular = document
    .getElementById("input-titular-tarjeta")
    .value
    .trim();

  const numero = obtenerDigitosTarjeta();
  const vencimiento = document
    .getElementById("input-vencimiento-tarjeta")
    .value
    .trim();

  const cvv = document.getElementById("input-cvv-tarjeta").value.trim();

  if (titular.split(/\s+/).filter(Boolean).length < 2) {
    return "Ingresa el nombre completo del titular de la tarjeta.";
  }

  if (numero.length < 13 || numero.length > 19 || !numeroTarjetaValido(numero)) {
    return "Ingresa un número de tarjeta válido para la simulación.";
  }

  if (!vencimientoValido(vencimiento)) {
    return "Ingresa una fecha de vencimiento válida en formato MM/AA.";
  }

  if (!/^\d{3,4}$/.test(cvv)) {
    return "El CVV debe tener 3 o 4 dígitos.";
  }

  return "";
}

function obtenerDigitosTarjeta() {
  return document.getElementById("input-numero-tarjeta").value.replace(/\D/g, "");
}

function numeroTarjetaValido(numero) {
  let suma = 0;
  let duplicar = false;

  for (let indice = numero.length - 1; indice >= 0; indice -= 1) {
    let digito = Number(numero[indice]);

    if (duplicar) {
      digito *= 2;
      if (digito > 9) {
        digito -= 9;
      }
    }

    suma += digito;
    duplicar = !duplicar;
  }

  return suma % 10 === 0;
}

function vencimientoValido(valor) {
  if (!/^\d{2}\/\d{2}$/.test(valor)) {
    return false;
  }

  const [mesTexto, anioTexto] = valor.split("/");
  const mes = Number(mesTexto);
  const anio = 2000 + Number(anioTexto);

  if (mes < 1 || mes > 12) {
    return false;
  }

  const hoy = new Date();
  const ultimoDiaVencimiento = new Date(anio, mes, 0, 23, 59, 59);
  return ultimoDiaVencimiento >= hoy;
}

function formatearNumeroTarjeta(evento) {
  const digitos = evento.target.value.replace(/\D/g, "").slice(0, 19);
  evento.target.value = digitos.replace(/(.{4})/g, "$1 ").trim();
  actualizarVistaTarjeta();
}

function formatearVencimientoTarjeta(evento) {
  const digitos = evento.target.value.replace(/\D/g, "").slice(0, 4);
  evento.target.value = digitos.length > 2
    ? `${digitos.slice(0, 2)}/${digitos.slice(2)}`
    : digitos;

  actualizarVistaTarjeta();
}

function actualizarVistaTarjeta() {
  const numero = obtenerDigitosTarjeta();
  const titular = document
    .getElementById("input-titular-tarjeta")
    .value
    .trim()
    .toUpperCase();

  const vencimiento = document
    .getElementById("input-vencimiento-tarjeta")
    .value
    .trim();

  document.getElementById("vista-numero-tarjeta").textContent = numero
    ? numero.replace(/(.{4})/g, "$1 ").trim()
    : "•••• •••• •••• ••••";

  document.getElementById("vista-titular-tarjeta").textContent = titular || "NOMBRE DEL TITULAR";
  document.getElementById("vista-vencimiento-tarjeta").textContent = vencimiento || "MM/AA";
}

function limpiarCamposTarjeta() {
  document.getElementById("input-titular-tarjeta").value = "";
  document.getElementById("input-numero-tarjeta").value = "";
  document.getElementById("input-vencimiento-tarjeta").value = "";
  document.getElementById("input-cvv-tarjeta").value = "";
  actualizarVistaTarjeta();
}

function limpiarDatosPagoSensibles() {
  limpiarCamposTarjeta();
  document.getElementById("select-banco-transferencia").selectedIndex = 0;
  document.getElementById("input-referencia-transferencia").value = "";

  document.querySelectorAll('input[name="metodo-pago"]').forEach((radio) => {
    radio.checked = false;
  });

  actualizarFormularioPago();
}

function guardarPreferenciasCheckout(preferencias) {
  try {
    localStorage.setItem(PREFERENCIAS_CHECKOUT_KEY, JSON.stringify(preferencias));
  } catch {
    /* Las preferencias son opcionales y no deben bloquear la compra. */
  }
}

function cargarPreferenciasCheckout() {
  try {
    const preferencias = JSON.parse(
      localStorage.getItem(PREFERENCIAS_CHECKOUT_KEY)
    );

    if (!preferencias) {
      return;
    }

    if (preferencias.tipo_entrega === "domicilio") {
      document.getElementById("radio-domicilio").checked = true;
    }

    if (preferencias.metodo_pago_preferido) {
      const radio = document.querySelector(
        `input[name="metodo-pago"][value="${preferencias.metodo_pago_preferido}"]`
      );

      if (radio) {
        radio.checked = true;
      }
    }
  } catch {
    /* Sin preferencias guardadas: se conservan los valores por defecto. */
  }

  actualizarVisibilidadDireccion();
  actualizarFormularioPago();
}

async function ubicarDireccionEnMapa() {
  const direccion = document
    .getElementById("input-direccion-entrega")
    .value
    .trim();

  const estadoEl = document.getElementById("estado-ubicacion");
  const boton = document.getElementById("btn-ubicar-direccion");

  if (!direccion) {
    estadoEl.textContent = "Ingresa una dirección antes de ubicarla.";
    estadoEl.className = "estado-ubicacion estado-ubicacion--error";
    return;
  }

  boton.disabled = true;
  boton.textContent = "Buscando...";
  estadoEl.textContent = "Buscando la dirección en Medellín...";
  estadoEl.className = "estado-ubicacion";

  try {
    const resultado = await geocodificarDireccion(direccion);

    document.getElementById("input-direccion-entrega").value = resultado.direccion;

    await mostrarMapaEntrega(
      resultado.latitud,
      resultado.longitud,
      resultado.direccion
    );

    estadoEl.textContent =
      "Dirección encontrada. Toca el mapa o arrastra el punto para ajustarlo, luego confírmalo.";
    estadoEl.className = "estado-ubicacion estado-ubicacion--exito";
  } catch (error) {
    limpiarUbicacionEntrega();
    estadoEl.textContent = error.message || "No fue posible ubicar la dirección.";
    estadoEl.className = "estado-ubicacion estado-ubicacion--error";
  } finally {
    boton.disabled = false;
    boton.textContent = "Ubicar";
  }
}

function mostrarMapaEntrega(latitud, longitud, direccionMostrada) {
  return new Promise((resolver) => {
    const contenedor = document.getElementById("contenedor-mapa-entrega");
    const punto = [latitud, longitud];

    contenedor.hidden = false;
    contenedor.classList.add("mapa-expandido");

    if (ULTIMO_ID_TIMEOUT_COLAPSO_MAPA) {
      clearTimeout(ULTIMO_ID_TIMEOUT_COLAPSO_MAPA);
    }

    function inicializarOActualizarMapa() {
      if (!mapaEntrega) {
        mapaEntrega = L.map("mapa-entrega", {
          zoomControl: true,
          scrollWheelZoom: false,
        });

        L.tileLayer("https://server.arcgisonline.com/ArcGIS/rest/services/World_Street_Map/MapServer/tile/{z}/{y}/{x}", {
          maxZoom: 19,
          attribution: "Tiles © Esri — Source: Esri, DeLorme, NAVTEQ",
        }).addTo(mapaEntrega);

        mapaEntrega.on("click", async (evento) => {
          await moverMarcadorYActualizar(evento.latlng.lat, evento.latlng.lng);
        });

        observarTamanoMapa(contenedor);
      }

      mapaEntrega.invalidateSize();
      mapaEntrega.setView(punto, 16);

      if (marcadorEntrega) {
        marcadorEntrega.setLatLng(punto);
      } else {
        marcadorEntrega = L.marker(punto, { draggable: true }).addTo(mapaEntrega);

        marcadorEntrega.on("dragend", async () => {
          const nuevaUbicacion = marcadorEntrega.getLatLng();
          await moverMarcadorYActualizar(nuevaUbicacion.lat, nuevaUbicacion.lng);
        });
      }

      UBICACION_ENTREGA_CONFIRMABLE = {
        latitud,
        longitud,
        direccion: direccionMostrada,
      };

      document.getElementById("check-confirmar-ubicacion").checked = false;

      requestAnimationFrame(() => {
        mapaEntrega.invalidateSize();
        mapaEntrega.setView(punto, 16);
      });

      ULTIMO_ID_TIMEOUT_COLAPSO_MAPA = setTimeout(() => {
        contenedor.classList.remove("mapa-expandido");

        setTimeout(() => {
          mapaEntrega.invalidateSize();
          mapaEntrega.setView(marcadorEntrega.getLatLng(), 16);
        }, 380);
      }, 1600);

      resolver();
    }

    /*
     * El panel del carrito tiene una transición CSS al abrirse.
     * Si el panel ya está abierto, se espera un frame; si no,
     * se espera a que termine su animación antes de crear el mapa,
     * porque Leaflet necesita que el contenedor ya tenga tamaño real.
     */
    const panel = document.getElementById("panel-carrito");

    if (panel.classList.contains("abierto")) {
      requestAnimationFrame(() => requestAnimationFrame(inicializarOActualizarMapa));
    } else {
      panel.addEventListener(
        "transitionend",
        () => requestAnimationFrame(inicializarOActualizarMapa),
        { once: true }
      );
    }
  });
}

function observarTamanoMapa(contenedor) {
  if (typeof ResizeObserver === "undefined") {
    return;
  }

  const observador = new ResizeObserver(() => {
    if (mapaEntrega) {
      mapaEntrega.invalidateSize();
    }
  });

  observador.observe(contenedor);
}

async function moverMarcadorYActualizar(latitud, longitud) {
  const estadoEl = document.getElementById("estado-ubicacion");

  marcadorEntrega.setLatLng([latitud, longitud]);
  document.getElementById("check-confirmar-ubicacion").checked = false;

  estadoEl.textContent = "Actualizando la referencia del punto seleccionado...";
  estadoEl.className = "estado-ubicacion";

  try {
    const resultado = await geocodificarInverso(latitud, longitud);

    document.getElementById("input-direccion-entrega").value = resultado.direccion;

    UBICACION_ENTREGA_CONFIRMABLE = {
      latitud,
      longitud,
      direccion: resultado.direccion,
    };

    estadoEl.textContent = "Punto ajustado. Confirma que esta ubicación es correcta.";
    estadoEl.className = "estado-ubicacion estado-ubicacion--exito";
  } catch {
    UBICACION_ENTREGA_CONFIRMABLE = {
      latitud,
      longitud,
      direccion: "Ubicación seleccionada en el mapa",
    };

    estadoEl.textContent = "Punto ajustado. Confirma que esta ubicación es correcta.";
    estadoEl.className = "estado-ubicacion estado-ubicacion--exito";
  }
}

function invalidarConfirmacionUbicacion() {
  if (!UBICACION_ENTREGA_CONFIRMABLE) {
    return;
  }

  UBICACION_ENTREGA_CONFIRMABLE = null;
  document.getElementById("check-confirmar-ubicacion").checked = false;
  document.getElementById("estado-ubicacion").textContent = "La dirección cambió. Vuelve a ubicarla en el mapa.";
  document.getElementById("estado-ubicacion").className = "estado-ubicacion";
}

function limpiarUbicacionEntrega() {
  UBICACION_ENTREGA_CONFIRMABLE = null;

  const contenedor = document.getElementById("contenedor-mapa-entrega");
  const check = document.getElementById("check-confirmar-ubicacion");
  const estado = document.getElementById("estado-ubicacion");

  if (contenedor) {
    contenedor.hidden = true;
    contenedor.classList.remove("mapa-expandido");
  }

  if (check) {
    check.checked = false;
  }

  if (estado) {
    estado.textContent = "";
    estado.className = "estado-ubicacion";
  }
}

/* ===== Sesion de usuario ===== */

const SESION_KEY = "mercadoviva_sesion";
let MODO_MODAL_CUENTA = "login";

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
  aplicarDatosEntregaAlFormulario(sesion);
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

  if (!btnCuenta || !linkEmpleado) {
    return;
  }

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

  document.getElementById("titulo-modal-cuenta").textContent = esLogin
    ? "Iniciar sesión"
    : "Crear cuenta";

  document.getElementById("btn-enviar-cuenta").textContent = esLogin
    ? "Iniciar sesión"
    : "Crear cuenta";

  document.getElementById("error-modal-cuenta").textContent = "";

  document.getElementById("tab-login").classList.toggle("btn-primario", esLogin);
  document.getElementById("tab-login").classList.toggle("btn-secundario", !esLogin);

  document.getElementById("tab-registro").classList.toggle("btn-primario", !esLogin);
  document.getElementById("tab-registro").classList.toggle("btn-secundario", esLogin);
}

async function enviarFormularioCuenta(evento) {
  evento.preventDefault();

  const usuario = document
    .getElementById("input-usuario-cuenta")
    .value
    .trim();

  const password = document.getElementById("input-password-cuenta").value;

  const errorEl = document.getElementById("error-modal-cuenta");
  const btnEnviar = document.getElementById("btn-enviar-cuenta");

  errorEl.textContent = "";

  if (!usuario || !password) {
    errorEl.textContent = "Usuario y contraseña son obligatorios.";
    return;
  }

  const ruta = MODO_MODAL_CUENTA === "login"
    ? "/usuarios/login"
    : "/usuarios/registro";

  btnEnviar.disabled = true;

  try {
    const resultado = await apiFetch(ruta, {
      method: "POST",
      body: JSON.stringify({
        usuario,
        password,
      }),
    });

    guardarSesion(resultado);

    cerrarModalCuenta();

    mostrarToast(
      MODO_MODAL_CUENTA === "login"
        ? `Bienvenido, ${resultado.usuario}`
        : "Cuenta creada con éxito",
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

  document
    .getElementById("btn-cancelar-cuenta")
    .addEventListener("click", cerrarModalCuenta);

  document
    .getElementById("tab-login")
    .addEventListener("click", () => cambiarModoModalCuenta("login"));

  document
    .getElementById("tab-registro")
    .addEventListener("click", () => cambiarModoModalCuenta("registro"));

  document
    .getElementById("form-cuenta")
    .addEventListener("submit", enviarFormularioCuenta);
});

/* ===== Carrusel de promociones ===== */

let slidePromocionActual = 0;
let intervaloPromociones = null;

function inicializarSliderPromociones() {
  const slider = document.getElementById("slider-promociones");

  if (!slider) {
    return;
  }

  const slides = slider.querySelectorAll(".slide-promocion");
  const pista = slider.querySelector(".slider-promociones__pista");

  const btnAnterior = slider.querySelector(
    ".slider-promociones__flecha--anterior"
  );

  const btnSiguiente = slider.querySelector(
    ".slider-promociones__flecha--siguiente"
  );

  const puntos = slider.querySelectorAll(".slider-promociones__punto");

  function irASlide(indice) {
    slidePromocionActual = (indice + slides.length) % slides.length;

    pista.style.transform = `translateX(-${slidePromocionActual * 100}%)`;

    puntos.forEach((punto, i) => {
      const activo = i === slidePromocionActual;

      punto.classList.toggle("activo", activo);
      punto.setAttribute("aria-current", activo ? "true" : "false");
    });
  }

  function reiniciarAutoavance() {
    clearInterval(intervaloPromociones);

    intervaloPromociones = setInterval(() => {
      irASlide(slidePromocionActual + 1);
    }, 5000);
  }

  btnAnterior.addEventListener("click", () => {
    irASlide(slidePromocionActual - 1);
    reiniciarAutoavance();
  });

  btnSiguiente.addEventListener("click", () => {
    irASlide(slidePromocionActual + 1);
    reiniciarAutoavance();
  });

  puntos.forEach((punto) => {
    punto.addEventListener("click", () => {
      irASlide(Number(punto.dataset.slide));
      reiniciarAutoavance();
    });
  });

  slides.forEach((slide) => {
    slide.addEventListener("click", () => {
      CATEGORIA_ACTIVA = slide.dataset.categoriaBanner;

      actualizarEstiloBotonesCategoria();
      aplicarFiltrosYRenderizar();

      document.getElementById("catalogo").scrollIntoView({
        behavior: "smooth",
        block: "start",
      });
    });
  });

  slider.addEventListener("mouseenter", () => {
    clearInterval(intervaloPromociones);
  });

  slider.addEventListener("mouseleave", () => {
    reiniciarAutoavance();
  });

  reiniciarAutoavance();
}
