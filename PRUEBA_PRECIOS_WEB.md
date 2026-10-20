# Prueba: precios comerciales y futura consulta web

Esta rama es una fase de prueba. No debe fusionarse a `main` hasta validar la interfaz y configurar el servidor.

## Código comercial

El código comercial es el ID actual del documento de `recetas` en Firestore.
No se crea ni migra otro identificador y no se modifica `codigoBarras`.

## Campos comerciales propuestos en `recetas/{id}`

- `presentacionVenta`: texto opcional, por ejemplo `Porción`, `Unidad`, `Caja x 6`.
- `porcionesTortaEntera`: entero opcional entre 2 y 100. Es independiente de `rendimiento`.
- `precioTortaEnteraManual`: importe opcional mayor a cero.
- `precioWebHabilitado`: booleano. Sólo los productos en `true` son consultables por el endpoint.
- `configComercialActualizadaAt`: fecha de la última edición comercial.

El precio por porción/unidad sigue usando el cálculo actual:
costo de receta / rendimiento -> margen individual o global -> redondeo actual de Mostrador.

El precio entero automático es:
`precioPorcionRedondeado * (porcionesTortaEntera - 1)`.

El precio manual, si existe y es válido, tiene prioridad. Al borrarlo vuelve al automático.
Si no existe cantidad de porciones ni precio manual, el precio entero es `null`, nunca cero.

## Fase de prueba en Deploy Preview

En cualquier host distinto de `dulce-app.netlify.app`, el editor comercial funciona como simulador:
- guarda los cambios sólo en `sessionStorage`;
- no escribe en Firestore;
- permite volver a Mostrador y probar el selector al escanear;
- elegir "Torta entera" sólo informa qué se agregaría/cobraría: no toca carrito, caja, stock ni ventas.

## Consulta futura

Ruta propuesta:

`GET /api/precio-producto?code=<ID_RECETA>`

Respuesta comercial:

```json
{
  "codigo": "ID_RECETA",
  "identificador": "ID_RECETA",
  "nombre": "Tiramisú",
  "presentacion": "Porción",
  "precioVigente": 6500,
  "porcionesTortaEntera": 8,
  "precioTortaEntera": 45500,
  "origenPrecioTortaEntera": "automatico",
  "actualizadoAt": "2026-10-19T23:00:00.000Z"
}
```

No devuelve costos, ingredientes, recetas, márgenes, clientes, cajas ni credenciales.

## Configuración de Netlify necesaria antes de producción

Configurar como secretos de Functions:
- `FIREBASE_PROJECT_ID`
- `FIREBASE_CLIENT_EMAIL`
- `FIREBASE_PRIVATE_KEY`

La cuenta de servicio debe tener sólo el acceso servidor necesario a Firestore.
No subir JSON de cuenta de servicio al repositorio.

La función usa Firebase Admin y omite las reglas cliente de Firestore, por eso el endpoint filtra explícitamente
`precioWebHabilitado === true` y construye una respuesta con campos comerciales permitidos.

## Antes de fusionar a main

1. Validar la UX desde PC y celular.
2. Confirmar por producto la presentación y, cuando corresponda, las porciones de torta entera.
3. Confirmar que el selector de escaneo es el flujo deseado.
4. Decidir cómo se registrará una torta entera en tickets/stock/costos antes de habilitarla para cobrar.
5. Configurar y probar la función con credenciales en Netlify.
6. Desplegar las reglas de Firestore que protegen los nuevos campos comerciales.
7. Recién entonces fusionar y publicar producción.
