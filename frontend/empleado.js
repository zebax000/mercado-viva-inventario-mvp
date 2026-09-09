/* ===== Logica del panel de empleado: acceso, CRUD de productos, reponer stock ===== */

const SESION_KEY = "mercadoviva_empleado_ok";
let PRODUCTOS_EMPLEADO = [];
let CODIGO_EN_EDICION = null;
let CODIGO_A_REPONER = null;

const SUBCATEGORIAS_POR_CATEGORIA = {
  "Frutas y Verduras": ["Frutas", "Verduras", "Hierbas y Aromáticas"],
  "Carnes": ["Res", "Cerdo", "Pollo", "Pescados y Mariscos"],
  "Lácteos": ["Leche", "Queso", "Yogurt", "Huevos"],
  "Despensa": ["Granos y Cereales", "Enlatados", "Aceites y Salsas", "Pastas"],
  "Bebidas": ["Gaseosas", "Jugos", "Agua", "Bebidas Alcohólicas"],
  "Panadería": ["Pan", "Pastelería", "Tortillas"],
  "Congelados": ["Comidas Listas", "Vegetales Congelados", "Helados"],
  "Aseo y Limpieza": ["Detergentes", "Papel Higiénico", "Limpieza del Hogar"],
  "Cuidado Personal": ["Higiene Personal", "Cosméticos", "Cuidado del Cabello"],
  "Otros": ["General"],
};

document.addEventListener("DOMContentLoaded", () => {
  if (sessionStorage.getItem(SESION_KEY) === "1") {
    mostrarPanel();
  }

  document.getElementById("btn-entrar").addEventListener("click", intentarAcceso);
  document.getElementById("input-codigo-acceso").addEventListener("keydown", (e) => {
    if (e.key === "Enter") intentarAcceso();
  });

  document.getElementById("btn-nuevo-producto").addEventListener("click", () => abrirModalProducto(null));
  document.getElementById("btn-cancelar-producto").addEventListener("click", cerrarModalProducto);
  document.getElementById("btn-guardar-producto").addEventListener("click", guardarProducto);

  document.getElementById("btn-cancelar-reponer").addEventListener("click", cerrarModalReponer);
  document.getElementById("btn-confirmar-reponer").addEventListener("click", confirmarReposicion);

  document.getElementById("form-categoria").addEventListener("change", (e) => {
    poblarSubcategorias(e.target.value, null);
  });
});

/* ===== Bloqueo de caracteres invalidos en campos numericos =====
   input type="number" permite escribir e, E, + y - (notacion cientifica),
   lo que dejaba el campo invalido y el valor terminaba guardandose como 0. */
const CAMPOS_NUMERICOS_IDS = ["form-stock", "form-precio", "form-cantidad-reponer", "form-descuento"];
const TECLAS_BLOQUEADAS = ["e", "E", "+", "-"];

document.addEventListener("keydown", (e) => {
  if (CAMPOS_NUMERICOS_IDS.includes(e.target.id) && TECLAS_BLOQUEADAS.includes(e.key)) {
    e.preventDefault();
  }
});

function limpiarNumero(valor) {
  const n = Number(valor);
  return Number.isFinite(n) && n >= 0 ? n : 0;
}

/* ===== Acceso ===== */

async function intentarAcceso() {
  const input = document.getElementById("input-codigo-acceso");
  const errorEl = document.getElementById("error-acceso");
  errorEl.textContent = "";

  try {
    await apiFetch("/empleado/verificar", {
      method: "POST",
      body: JSON.stringify({ codigo: input.value }),
    });
    sessionStorage.setItem(SESION_KEY, "1");
    mostrarPanel();
  } catch (error) {
    errorEl.textContent = error.message;
  }
}

function mostrarPanel() {
  document.getElementById("panel-acceso").hidden = true;
  document.getElementById("panel-empleado").hidden = false;
  cargarProductosEmpleado();
}

/* ===== Listado ===== */

async function cargarProductosEmpleado() {
  const mensajeEl = document.getElementById("empleado-mensaje");
  const tbody = document.getElementById("tabla-productos-body");
  mensajeEl.hidden = true;

  try {
    PRODUCTOS_EMPLEADO = await apiFetch("/productos");
    renderizarTabla(PRODUCTOS_EMPLEADO);
  } catch (error) {
    tbody.innerHTML = "";
    mensajeEl.hidden = false;
    mensajeEl.textContent = error.codigoError === "INVENTARIO_VACIO"
      ? "No hay productos registrados todavía. Agrega el primero."
      : `No se pudo cargar el inventario: ${error.message}`;
  }
}

function renderizarTabla(productos) {
  const tbody = document.getElementById("tabla-productos-body");
  tbody.innerHTML = "";

  productos.forEach((producto) => {
    const fila = document.createElement("tr");
    fila.innerHTML = `
      <td><img src="${producto.imagen_url || 'img/placeholder.png'}" alt="${producto.nombre}"></td>
      <td>${producto.codigo}</td>
      <td>${producto.nombre}</td>
      <td>${formatearPrecio(producto.precio)}</td>
      <td>${producto.stock}</td>
      <td class="acciones"></td>
    `;

    const celdaAcciones = fila.querySelector(".acciones");

    const btnReponer = document.createElement("button");
    btnReponer.className = "btn-secundario";
    btnReponer.textContent = "Reponer";
    btnReponer.addEventListener("click", () => abrirModalReponer(producto));

    const btnEditar = document.createElement("button");
    btnEditar.className = "btn-secundario";
    btnEditar.textContent = "Editar";
    btnEditar.addEventListener("click", () => abrirModalProducto(producto));

    const btnEliminar = document.createElement("button");
    btnEliminar.className = "btn-peligro";
    btnEliminar.textContent = "Eliminar";
    btnEliminar.addEventListener("click", () => eliminarProducto(producto));

    celdaAcciones.append(btnReponer, btnEditar, btnEliminar);
    tbody.appendChild(fila);
  });
}

/* ===== Categoria / Subcategoria (listas dependientes) ===== */

function poblarSubcategorias(categoria, subcategoriaSeleccionada) {
  const select = document.getElementById("form-subcategoria");
  select.innerHTML = "";

  const opciones = SUBCATEGORIAS_POR_CATEGORIA[categoria] || [];

  if (opciones.length === 0) {
    const opcionVacia = document.createElement("option");
    opcionVacia.value = "";
    opcionVacia.textContent = "Selecciona primero una categoría";
    select.appendChild(opcionVacia);
    return;
  }

  opciones.forEach((opcion) => {
    const elOpcion = document.createElement("option");
    elOpcion.value = opcion;
    elOpcion.textContent = opcion;
    if (opcion === subcategoriaSeleccionada) elOpcion.selected = true;
    select.appendChild(elOpcion);
  });
}

/* ===== Dias de descuento (checkboxes) ===== */

function marcarDiasDescuento(diasTexto) {
  const dias = (diasTexto || "").split(",").map((d) => d.trim().toLowerCase()).filter(Boolean);
  document.querySelectorAll("#grupo-dias-descuento input[type=checkbox]").forEach((checkbox) => {
    checkbox.checked = dias.includes(checkbox.value);
  });
}

function obtenerDiasDescuentoSeleccionados() {
  const seleccionados = Array.from(
    document.querySelectorAll("#grupo-dias-descuento input[type=checkbox]:checked")
  ).map((checkbox) => checkbox.value);
  return seleccionados.length > 0 ? seleccionados.join(",") : null;
}

/* ===== Crear / editar producto ===== */

function abrirModalProducto(producto) {
  CODIGO_EN_EDICION = producto ? producto.codigo : null;
  document.getElementById("modal-producto-error").textContent = "";
  document.getElementById("modal-producto-titulo").textContent = producto ? "Editar producto" : "Agregar producto";

  const inputCodigo = document.getElementById("form-codigo");
  inputCodigo.value = producto ? producto.codigo : "";
  inputCodigo.disabled = Boolean(producto); // el codigo no se edita, solo se crea una vez

  document.getElementById("form-nombre").value = producto ? producto.nombre : "";
  document.getElementById("form-stock").value = producto ? producto.stock : 0;
  document.getElementById("form-precio").value = producto ? producto.precio : 0;
  document.getElementById("form-imagen").value = producto ? (producto.imagen_url || "") : "";
  document.getElementById("form-categoria").value = producto ? (producto.categoria || "") : "";
  document.getElementById("form-descuento").value = producto ? (producto.descuento_porcentaje || 0) : 0;

  poblarSubcategorias(producto ? (producto.categoria || "") : "", producto ? producto.subcategoria : null);
  marcarDiasDescuento(producto ? producto.dias_descuento : null);

  document.getElementById("form-stock").closest(".campo-form").style.display = producto ? "none" : "block";

  document.getElementById("modal-producto").hidden = false;
}

function cerrarModalProducto() {
  document.getElementById("modal-producto").hidden = true;
}

async function guardarProducto() {
  const errorEl = document.getElementById("modal-producto-error");
  errorEl.textContent = "";

  const codigo = document.getElementById("form-codigo").value.trim();
  const nombre = document.getElementById("form-nombre").value.trim();
  const stock = limpiarNumero(document.getElementById("form-stock").value);
  const precio = limpiarNumero(document.getElementById("form-precio").value);
  const imagen_url = document.getElementById("form-imagen").value.trim() || null;
  const categoria = document.getElementById("form-categoria").value || null;
  const subcategoria = document.getElementById("form-subcategoria").value || null;
  const descuento_porcentaje = limpiarNumero(document.getElementById("form-descuento").value);
  const dias_descuento = obtenerDiasDescuentoSeleccionados();

  if (!codigo || !nombre) {
    errorEl.textContent = "Código y nombre son obligatorios.";
    return;
  }

  try {
    if (CODIGO_EN_EDICION) {
      await apiFetch(`/productos/${CODIGO_EN_EDICION}`, {
        method: "PUT",
        body: JSON.stringify({ nombre, precio, imagen_url, categoria, subcategoria, descuento_porcentaje, dias_descuento }),
      });
      mostrarToast("Producto actualizado", "exito");
    } else {
      await apiFetch("/productos", {
        method: "POST",
        body: JSON.stringify({ codigo, nombre, stock, precio, imagen_url, categoria, subcategoria, descuento_porcentaje, dias_descuento }),
      });
      mostrarToast("Producto creado", "exito");
    }
    cerrarModalProducto();
    cargarProductosEmpleado();
  } catch (error) {
    errorEl.textContent = error.message;
  }
}

/* ===== Eliminar ===== */

async function eliminarProducto(producto) {
  const confirmado = window.confirm(`¿Eliminar "${producto.nombre}" (${producto.codigo})? Esta acción no se puede deshacer.`);
  if (!confirmado) return;

  try {
    await apiFetch(`/productos/${producto.codigo}`, { method: "DELETE" });
    mostrarToast("Producto eliminado", "exito");
    cargarProductosEmpleado();
  } catch (error) {
    mostrarToast(`No se pudo eliminar: ${error.message}`, "error");
  }
}

/* ===== Reponer stock ===== */

function abrirModalReponer(producto) {
  CODIGO_A_REPONER = producto.codigo;
  document.getElementById("modal-reponer-error").textContent = "";
  document.getElementById("reponer-nombre").textContent = `${producto.nombre} — stock actual: ${producto.stock}`;
  document.getElementById("form-cantidad-reponer").value = "";
  document.getElementById("modal-reponer").hidden = false;
}

function cerrarModalReponer() {
  document.getElementById("modal-reponer").hidden = true;
}

async function confirmarReposicion() {
  const errorEl = document.getElementById("modal-reponer-error");
  const cantidad = limpiarNumero(document.getElementById("form-cantidad-reponer").value);

  if (!cantidad || cantidad <= 0) {
    errorEl.textContent = "Ingresa una cantidad mayor a 0.";
    return;
  }

  try {
    await apiFetch(`/productos/${CODIGO_A_REPONER}/stock/ajuste`, {
      method: "POST",
      body: JSON.stringify({ tipo_operacion: "reposicion", cantidad }),
    });
    mostrarToast("Stock repuesto", "exito");
    cerrarModalReponer();
    cargarProductosEmpleado();
  } catch (error) {
    errorEl.textContent = error.message;
  }
}
