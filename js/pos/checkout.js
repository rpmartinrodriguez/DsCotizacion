import {
    collection, doc, runTransaction, Timestamp
} from "https://www.gstatic.com/firebasejs/9.15.0/firebase-firestore.js";

const number = value => Number.isFinite(Number(value)) ? Number(value) : 0;
export const toCents = value => Math.round(number(value) * 100);
export const fromCents = cents => number(cents) / 100;

const sortedLotsAfterSale = (lots, quantity) => {
    let remaining = quantity;
    const sorted = (Array.isArray(lots) ? lots : [])
        .map(lot => ({ ...lot }))
        .sort((a, b) => {
            const aTime = new Date(a.fechaVto || '9999-12-31').getTime();
            const bTime = new Date(b.fechaVto || '9999-12-31').getTime();
            return (Number.isFinite(aTime) ? aTime : Infinity)
                - (Number.isFinite(bTime) ? bTime : Infinity);
        });

    const updated = [];
    for (const lot of sorted) {
        const existing = Math.max(0, number(lot.cantidad));
        const deducted = Math.min(existing, remaining);
        remaining -= deducted;
        if (existing - deducted > 0) updated.push({ ...lot, cantidad: existing - deducted });
    }
    return updated;
};

export const savePOSCheckout = async ({
    db,
    cajaId,
    items,
    products,
    method,
    amountCash = 0,
    amountMP = 0,
    clientId = null,
    userId,
    userName,
    operationId = null
}) => {
    if (!cajaId || !Array.isArray(items) || !items.length || !userId) {
        throw new Error('Faltan datos para guardar la venta.');
    }

    const isPrepaid = method === 'CuentaCorriente';
    if (isPrepaid !== Boolean(clientId)) {
        throw new Error('La forma de pago no coincide con la cuenta del cliente.');
    }

    const productsById = new Map((products || []).map(product => [String(product.id), product]));
    const lines = items.map(item => {
        const quantity = Number(item.cantidad);
        const price = Number(item.precio);
        const product = productsById.get(String(item.id));
        if (!product || !Number.isInteger(quantity) || quantity < 1
            || !Number.isFinite(price) || price < 0) {
            throw new Error('El carrito contiene cantidades o precios inválidos.');
        }

        const unitCost = Math.max(0, number(product.costoBaseCalculado));
        const revenue = Math.round(price * quantity * 100) / 100;
        const totalCost = unitCost * quantity;
        const profit = revenue - totalCost;

        return {
            id: String(item.id),
            nombre: String(item.nombre || product.nombreTorta || ''),
            precio: price,
            cantidad: quantity,
            costoUnitarioVenta: unitCost,
            costoTotalVenta: totalCost,
            utilidadBrutaVenta: profit,
            margenBrutoVentaPct: revenue > 0 ? profit / revenue * 100 : 0,
            porcentajeGananciaAplicado: number(product.porcentajeGananciaAplicado),
            costoSnapshotVersion: 1
        };
    });

    const total = Math.round(lines.reduce((sum, line) => sum + line.precio * line.cantidad, 0) * 100) / 100;
    const cents = toCents(total);
    if (cents <= 0) throw new Error('El importe de la venta debe ser mayor a cero.');
    if (!isPrepaid && Math.abs(toCents(amountCash + amountMP) - cents) > 1) {
        throw new Error('Los medios de pago no suman el total de la venta.');
    }

    // Se mantiene el mismo ID ante reintentos por respuestas de red ambiguas.
    const saleRef = operationId
        ? doc(db, 'ventasMostrador', operationId)
        : doc(collection(db, 'ventasMostrador'));
    const movementRef = isPrepaid ? doc(db, 'ccMovimientos', saleRef.id) : null;
    const cajaRef = doc(db, 'cajas', cajaId);
    const clientRef = clientId ? doc(db, 'ccClientes', clientId) : null;
    const unique = [...new Set(lines.map(line => line.id))];
    if (unique.length !== lines.length) {
        throw new Error('El carrito tiene productos duplicados; volvé a cargarlo.');
    }
    const recipeRefs = unique.map(id => doc(db, 'recetas', id));
    const auditRefs = lines.map(() => doc(collection(db, 'auditoriaMostrador')));
    const totalCost = lines.reduce((sum, line) => sum + line.costoTotalVenta, 0);

    return runTransaction(db, async tx => {
        // Firestore exige todas las lecturas antes de cualquier escritura.
        const cajaSnap = await tx.get(cajaRef);
        const clientSnap = clientRef ? await tx.get(clientRef) : null;
        const existingSale = await tx.get(saleRef);
        const existingMovement = movementRef ? await tx.get(movementRef) : null;
        const recipeSnaps = [];
        for (const recipeRef of recipeRefs) recipeSnaps.push(await tx.get(recipeRef));

        if (existingSale.exists()) {
            const saved = existingSale.data();
            const sameItems = Array.isArray(saved.items)
                && saved.items.length === lines.length
                && saved.items.every((savedLine, index) =>
                    savedLine.id === lines[index].id
                    && savedLine.cantidad === lines[index].cantidad
                    && savedLine.precio === lines[index].precio
                );
            if (saved.cajaId !== cajaId
                || saved.metodoPago !== method
                || saved.total !== total
                || (saved.cuentaCorrienteClienteId || null) !== clientId
                || !sameItems) {
                throw new Error('El identificador de la operación ya corresponde a otra venta.');
            }

            return {
                ventaId: saleRef.id,
                movimientoId: saved.movimientoCuentaCorrienteId || null,
                saldoPosteriorCentavos: existingMovement?.exists()
                    ? existingMovement.data().saldoPosteriorCentavos : null,
                ticket: saved,
                alreadyRegistered: true
            };
        }
        if (existingMovement?.exists()) {
            throw new Error('Movimiento de saldo sin venta vinculada. Se requiere revisión administrativa.');
        }
        if (!cajaSnap.exists() || cajaSnap.data().estado !== 'abierta') {
            throw new Error('La caja ya no está abierta. Recargá el Mostrador.');
        }
        if (recipeSnaps.some(snapshot => !snapshot.exists())) {
            throw new Error('Uno de los productos ya no existe.');
        }

        let previousCents = 0;
        if (isPrepaid) {
            if (!clientSnap?.exists() || clientSnap.data().activo === false) {
                throw new Error('La cuenta corriente ya no está disponible.');
            }
            previousCents = Number(clientSnap.data().saldoCentavos);
            if (!Number.isSafeInteger(previousCents) || previousCents < 0) {
                throw new Error('El saldo registrado necesita revisión administrativa.');
            }
            if (previousCents < cents) {
                throw new Error('Saldo insuficiente. Cargá un anticipo antes de cerrar la venta.');
            }
        }

        const now = Timestamp.now();
        const caja = cajaSnap.data();
        const ticket = {
            cajaId,
            fecha: now,
            metodoPago: method,
            total,
            pagoEfectivo: isPrepaid ? 0 : amountCash,
            pagoMercadoPago: isPrepaid ? 0 : amountMP,
            items: lines,
            costoTotalVenta: totalCost,
            utilidadBrutaVenta: total - totalCost,
            margenBrutoVentaPct: (total - totalCost) / total * 100,
            costoSnapshotVersion: 1,
            vendedor: caja.usuarioNombre || userName,
            ...(isPrepaid ? {
                cuentaCorrienteClienteId: clientId,
                cuentaCorrienteNombre: clientSnap.data().nombre || '',
                movimientoCuentaCorrienteId: movementRef.id
            } : {})
        };

        // Receta + saldo + ticket + movimientos + caja se confirman juntos.
        recipeSnaps.forEach((snapshot, index) => {
            const line = lines[index];
            const old = snapshot.data();
            const existingStock = Math.max(0, number(old.stockMostrador));
            const nextStock = Math.max(0, existingStock - line.cantidad);
            tx.update(snapshot.ref, {
                stockMostrador: nextStock,
                lotes: sortedLotsAfterSale(old.lotes, line.cantidad)
            });
            tx.set(auditRefs[index], {
                productoId: line.id,
                productoNombre: line.nombre,
                tipo: 'RESTA',
                cantidad: line.cantidad,
                stockResultante: nextStock,
                motivo: line.cantidad > existingStock
                    ? `Venta (${method}) · stock informativo/no bloqueante`
                    : `Venta (${method})`,
                usuario: userName,
                usuarioId: userId,
                fecha: now
            });
        });

        if (isPrepaid) {
            const nextCents = previousCents - cents;
            tx.update(clientRef, {
                saldoCentavos: nextCents,
                ultimoMovimientoId: movementRef.id,
                ultimoMovimientoAt: now,
                updatedAt: now
            });
            tx.set(movementRef, {
                clienteId: clientId,
                clienteNombre: clientSnap.data().nombre || '',
                tipo: 'consumo',
                montoCentavos: cents,
                saldoAnteriorCentavos: previousCents,
                saldoPosteriorCentavos: nextCents,
                cajaId,
                ventaId: saleRef.id,
                fecha: now,
                usuarioId: userId,
                usuarioNombre: userName
            });
            tx.update(cajaRef, {
                ventasCuentaCorriente: number(caja.ventasCuentaCorriente) + total
            });
        } else {
            tx.update(cajaRef, {
                totalEfectivo: number(caja.totalEfectivo) + amountCash,
                totalMercadoPago: number(caja.totalMercadoPago) + amountMP
            });
        }

        tx.set(saleRef, ticket);
        return {
            ventaId: saleRef.id,
            movimientoId: movementRef?.id || null,
            saldoPosteriorCentavos: isPrepaid ? previousCents - cents : null,
            ticket
        };
    });
};
