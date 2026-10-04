# Checklist de activación — Dulce Sall (EERR + Cuenta corriente)

**Estado**: PENDIENTE. No activar operaciones financieras hasta completar todas las verificaciones.

**Aplicación**: Netlify `dulce-app`  
**Proyecto Firebase**: `dscotizacion`  
**Código**: PR #4 (`pos-ux-v3`)  
**Importante**: la preview y producción apuntan a **la misma base real** de Firestore.

## 1. Respaldar y reconciliar las reglas actualmente desplegadas

1. Entrar a Firebase Console → proyecto **dscotizacion** → Firestore Database → **Reglas**.
2. Copiar/exportar las reglas ACTIVAS, su fecha de publicación y crear un respaldo.
3. Compararlas con el archivo `firestore.rules` de PR #4; **no sobrescribirlas sin reconciliación**.
4. Comprobar el control de permisos existente para `usuarios`, `recetas`, `cajas`, `ventasMostrador`, `auditoriaMostrador`, `config` y todas las colecciones utilizadas.
5. Verificar específicamente los permisos nuevos de `gastosOperativos`, `ccClientes` y `ccMovimientos`. Los asientos son inmutables y los saldos solo pueden alterarse junto con movimientos relacionados.

## 2. Probar las reglas con un entorno aislado

Usar proyecto de staging o Firestore Emulator con datos sintéticos y usuarios/roles de prueba.

- Usuario sin sesión: no puede leer ni modificar cuentas, gastos ni movimientos.
- Usuario sin permiso Mostrador: no puede crear anticipos, cambiar saldos ni consumir productos.
- Usuario sin permiso Finanzas: no puede crear/modificar gastos.
- Usuario Mostrador: puede crear cliente con saldo 0, registrar anticipo y consumos asociados.
- Intento de cambio directo de `ccClientes.saldoCentavos` sin `ccMovimientos` vinculados: RECHAZADO.
- Intento de modificar/eliminar un asiento de `ccMovimientos`: RECHAZADO.
- Consumo: ticket, saldo, caja, stock y auditoría se confirman juntos.
- Saldo insuficiente: la operación completa se rechaza sin modificaciones.
- Anticipo: incrementa saldo y entrada efectiva/MP de la caja; **no crea ticket de venta**.
- Consumo: crea ticket de venta y baja saldo; **no cobra efectivo/MP nuevamente**.
- Reintento con mismo identificador de operación: no duplica movimientos.
- Editar/eliminar tickets de Cuenta corriente desde Cajas: RECHAZADO.
- Los flujos anteriores del Mostrador, Compras, Stock, Recetas, Historial, Presupuestos, Finanzas y roles vigentes siguen funcionando.

## 3. Conciliar importes

Caso de prueba aislado:
- Cliente nuevo: saldo $0.
- Anticipo efectivo: +$60.000; saldo $60.000; ingreso físico de caja +$60.000.
- Consumo de productos por $18.500; saldo $41.500; movimiento de venta +$18.500.
- Caja física tras consumo: sin movimiento adicional.
- EERR reconoce $18.500 de venta, **no** $60.000 de anticipo.
- Comprobar costos de venta, trazabilidad, y precio/cantidad.

Gastos:
- Crear sueldos y alquiler para octubre, agrupar por categoría.
- Editar y eliminar conceptos en staging.
- Copiar conceptos del mes anterior sin duplicados.
- EERR muestra resultado bruto, gastos operativos y resultado operativo.
- Mes sin costo documentado: muestra estimación claramente identificada o bloquea resultado, nunca informa rentabilidad como si fuera cierta.

## 4. Publicar reglas y activar con aprobación

1. Publicar las reglas reconciliadas/validadas en Firebase **desde una cuenta autorizada**.
2. Confirmar manualmente en Firebase Console que las reglas publicadas son las verificadas.
3. En el branch, activar deliberadamente `FIREBASE_FINANCIAL_RULES_VERIFIED = true` en `js/finanzas/eerr.js` y `js/pos/current-account.js` SOLO después de esta confirmación.
4. Ejecutar nuevamente pruebas de regresión en staging y compilar Netlify.
5. Verificar que el PR #4 no contenga cambios no aprobados. Publicar `main`.
6. Revisar la primera operación REAL con un anticipo y consumo controlados, bajo supervisión; nunca usar la preview compartida para simular saldos.

## Rollback

- Guardar SHA previo del branch `main` y la versión anterior de las reglas.
- Ante fallas: volver a bloquear **primero** los nuevos movimientos financieros y aislar operaciones afectadas; no borrar documentos históricos que respalden saldo o caja.
- Conciliar `ccClientes.saldoCentavos` con `ccMovimientos` antes de cualquier corrección manual.
- Considerar las implicancias fiscales de anticipos según comprobantes y asesoramiento contable antes de marcar importes como facturados.

## Estado automático actual

- Los guards de escrituras financieras quedan deliberadamente **desactivados** hasta completar reglas/staging y la habilitación explícita.
- Netlify Deploy Preview verde **no** demuestra permisos de Firebase ni pruebas financieras end-to-end.
