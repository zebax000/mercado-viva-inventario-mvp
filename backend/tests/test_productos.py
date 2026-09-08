def _crear_producto(client, codigo="ARROZ001", stock=10, precio=5000):
    return client.post(
        "/productos",
        json={
            "codigo": codigo,
            "nombre": "Arroz premium",
            "stock": stock,
            "precio": precio,
        },
    )


class TestFlujoExitoso:
    def test_crear_consultar_y_vender_producto(self, client):
        respuesta_crear = _crear_producto(client, stock=10)
        assert respuesta_crear.status_code == 201
        assert respuesta_crear.json()["stock"] == 10

        respuesta_consulta = client.get("/productos/ARROZ001")
        assert respuesta_consulta.status_code == 200
        assert respuesta_consulta.json()["nombre"] == "Arroz premium"

        respuesta_venta = client.post(
            "/productos/ARROZ001/stock/ajuste",
            json={"tipo_operacion": "venta", "cantidad": 3},
        )
        assert respuesta_venta.status_code == 200
        assert respuesta_venta.json()["stock"] == 7

    def test_reponer_stock_incrementa_correctamente(self, client):
        _crear_producto(client, codigo="LECHE001", stock=5)
        respuesta = client.post(
            "/productos/LECHE001/stock/ajuste",
            json={"tipo_operacion": "reposicion", "cantidad": 20},
        )
        assert respuesta.status_code == 200
        assert respuesta.json()["stock"] == 25

    def test_correccion_manual_de_stock(self, client):
        _crear_producto(client, codigo="HUEVOS01", stock=30)
        respuesta = client.post(
            "/productos/HUEVOS01/stock/ajuste",
            json={"tipo_operacion": "correccion", "cantidad": 18},
        )
        assert respuesta.status_code == 200
        assert respuesta.json()["stock"] == 18

    def test_listado_general_de_inventario(self, client):
        _crear_producto(client, codigo="PAN001", stock=8)
        _crear_producto(client, codigo="PAN002", stock=4)
        respuesta = client.get("/productos")
        assert respuesta.status_code == 200
        codigos = [p["codigo"] for p in respuesta.json()]
        assert "PAN001" in codigos and "PAN002" in codigos

    def test_editar_producto_actualiza_nombre_y_precio(self, client):
        _crear_producto(client, codigo="CAFE001", stock=15, precio=12000)
        respuesta = client.put(
            "/productos/CAFE001",
            json={"nombre": "Cafe premium tostado", "precio": 13500},
        )
        assert respuesta.status_code == 200
        assert respuesta.json()["nombre"] == "Cafe premium tostado"
        assert respuesta.json()["precio"] == 13500

    def test_eliminar_producto(self, client):
        _crear_producto(client, codigo="YOGUR001")
        respuesta_borrar = client.delete("/productos/YOGUR001")
        assert respuesta_borrar.status_code == 204

        respuesta_consulta = client.get("/productos/YOGUR001")
        assert respuesta_consulta.status_code == 404

    def test_acceso_empleado_con_codigo_correcto(self, client):
        respuesta = client.post("/empleado/verificar", json={"codigo": "1234"})
        assert respuesta.status_code == 200
        assert respuesta.json()["ok"] is True


class TestCasosExcepcionales:
    def test_venta_con_stock_insuficiente(self, client):
        _crear_producto(client, codigo="ACEITE01", stock=2)
        respuesta = client.post(
            "/productos/ACEITE01/stock/ajuste",
            json={"tipo_operacion": "venta", "cantidad": 5},
        )
        assert respuesta.status_code == 400
        assert respuesta.json()["detail"]["error"] == "STOCK_INSUFICIENTE"

    def test_consultar_producto_inexistente(self, client):
        respuesta = client.get("/productos/NOEXISTE")
        assert respuesta.status_code == 404
        assert respuesta.json()["detail"]["error"] == "PRODUCTO_NO_ENCONTRADO"

    def test_crear_producto_con_codigo_duplicado(self, client):
        _crear_producto(client, codigo="SAL001")
        respuesta = _crear_producto(client, codigo="SAL001")
        assert respuesta.status_code == 400
        assert respuesta.json()["detail"]["error"] == "CODIGO_DUPLICADO"

    def test_ajuste_con_cantidad_cero_es_invalido(self, client):
        _crear_producto(client, codigo="AZUCAR01", stock=10)
        respuesta = client.post(
            "/productos/AZUCAR01/stock/ajuste",
            json={"tipo_operacion": "venta", "cantidad": 0},
        )
        assert respuesta.status_code == 400
        assert respuesta.json()["detail"]["error"] == "CANTIDAD_INVALIDA"

    def test_listado_vacio(self, client):
        respuesta = client.get("/productos")
        assert respuesta.status_code == 404
        assert respuesta.json()["detail"]["error"] == "INVENTARIO_VACIO"

    def test_eliminar_producto_inexistente(self, client):
        respuesta = client.delete("/productos/NOEXISTE")
        assert respuesta.status_code == 404
        assert respuesta.json()["detail"]["error"] == "PRODUCTO_NO_ENCONTRADO"

    def test_acceso_empleado_con_codigo_incorrecto(self, client):
        respuesta = client.post("/empleado/verificar", json={"codigo": "0000"})
        assert respuesta.status_code == 401
        assert respuesta.json()["detail"]["error"] == "CODIGO_INCORRECTO"
