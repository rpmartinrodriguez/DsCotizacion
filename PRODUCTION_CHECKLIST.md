# Dulce Sall Admin 2.0 — Checklist de producción

> Estado actual: desarrollo en `redesign-v2`. No fusionar a `main` hasta completar este checklist.

## 1. Seguridad Firebase

- [ ] Abrir Firebase Console > Firestore Database > Rules.
- [ ] Copiar las reglas actuales y guardarlas como respaldo.
- [ ] Comparar reglas actuales con `firestore.rules` de esta rama.
- [ ] Probar las nuevas reglas en Rules Playground / Emulator.
- [ ] Usuario master: acceso completo esperado.
- [ ] Empleado Mostrador: puede vender, abrir/cerrar caja y usar stock del mostrador.
- [ ] Empleado sin Mostrador: no puede escribir cajas ni ventas.
- [ ] Empleado Stock: puede operar materias primas y movimientos de stock.
- [ ] Empleado Presupuestos: puede crear presupuestos.
- [ ] Empleado Historial: puede confirmar ventas y descontar materias primas.
- [ ] Empleado Clientes: puede leer/escribir clientes.
- [ ] Usuario inactivo: solo puede leer su propio perfil y no puede acceder a datos operativos.
- [ ] Publicar reglas solo después de estas pruebas.

## 2. Prueba funcional Deploy Preview

URL: https://deploy-preview-1--dulce-app.netlify.app

### Login y permisos
- [ ] Login master.
- [ ] Login empleado.
- [ ] Usuario sin permiso es redirigido correctamente.
- [ ] Usuario inactivo no puede ingresar.
- [ ] Cerrar sesión.

### Mostrador
- [ ] Abrir caja.
- [ ] Agregar producto.
- [ ] Sumar/restar cantidades.
- [ ] Cobro efectivo.
- [ ] Cobro Mercado Pago.
- [ ] Cobro mixto.
- [ ] Cálculo de vuelto.
- [ ] Revisar tickets.
- [ ] Corregir método de pago.
- [ ] Cerrar caja.

### Inventario Mostrador
- [ ] Buscar producto.
- [ ] Sumar stock.
- [ ] Restar stock.
- [ ] Ver auditoría.
- [ ] Cambiar margen individual como admin.
- [ ] Volver al margen global.
- [ ] Generar código de barras.
- [ ] Descargar etiqueta.

### Carga histórica
- [ ] Agregar movimientos.
- [ ] Efectivo y Mercado Pago.
- [ ] Varias fechas.
- [ ] Guardar.
- [ ] Verificar cajas históricas creadas.

### Stock / Compras
- [ ] Registrar compra.
- [ ] Crear materia prima.
- [ ] Editar lotes.
- [ ] Ajustar stock.
- [ ] Ver movimientos.
- [ ] Lista de compras.

### Presupuestos / Historial
- [ ] Crear presupuesto.
- [ ] Guardarlo.
- [ ] Abrir historial.
- [ ] Confirmar venta.
- [ ] Verificar descuento de materias primas.
- [ ] Verificar movimiento de stock.
- [ ] Verificar fecha de entrega en Agenda.
- [ ] Eliminar presupuesto de prueba.

### Clientes
- [ ] Buscar.
- [ ] Editar teléfono/email/notas.
- [ ] Ver historial.

### Caja / Finanzas
- [ ] Historial de cajas.
- [ ] Facturación MP.
- [ ] Marcar facturado.
- [ ] Papelera/restauración.
- [ ] Estadísticas.
- [ ] Finanzas por período.

### Otros
- [ ] PDF de lista de precios.
- [ ] Usuarios y permisos.
- [ ] Modelos 3D.
- [ ] Dashboard.
- [ ] Responsive iPhone.
- [ ] Responsive iPad.
- [ ] Responsive escritorio.

## 3. Antes del merge

- [ ] Confirmar Deploy Preview de Netlify en verde.
- [ ] Confirmar que no existen errores críticos en consola.
- [ ] Guardar/exportar respaldo de Firestore.
- [ ] Registrar SHA estable actual de `main`.
- [ ] Confirmar PR #1 sin conflictos.
- [ ] Revisar cambios del PR.

## 4. Publicación

- [ ] Fusionar `redesign-v2` → `main`.
- [ ] Esperar deploy de producción de Netlify.
- [ ] Abrir https://dulce-app.netlify.app
- [ ] Smoke test: login → venta → caja → stock → logout.
- [ ] Verificar actualización de PWA en iPhone/iPad.

## 5. Rollback

Si aparece un error crítico:

1. Revertir el merge commit del PR #1 en GitHub.
2. Esperar redeploy automático de Netlify.
3. Confirmar que volvió la versión anterior.
4. No restaurar Firestore salvo que haya ocurrido una modificación de datos incorrecta.
