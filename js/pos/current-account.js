import {
    collection, doc, addDoc, updateDoc, getDocs, onSnapshot,
    query, where, runTransaction, Timestamp
} from "https://www.gstatic.com/firebasejs/9.15.0/firebase-firestore.js";
import { toCents, fromCents } from "./checkout.js";
import { formatCurrency } from "../core/format.js";
import { escapeHtml, escapeAttribute } from "../core/html.js";

const formatMoney = cents => formatCurrency(fromCents(cents));
const humanDate = date => {
    try {
        return date?.toDate?.().toLocaleString('es-AR', {
            day: '2-digit', month: '2-digit', year: 'numeric',
            hour: '2-digit', minute: '2-digit'
        }) || '—';
    } catch {
        return '—';
    }
};

export function setupCurrentAccount({
    db,
    getCaja,
    getUser,
    getUserName,
    onOpen,
    onReturn,
    onSelectForSale
}) {
    const clientCollection = collection(db, 'ccClientes');
    const movementCollection = collection(db, 'ccMovimientos');

    const root = document.getElementById('pantalla-cuenta-corriente');
    const openButton = document.getElementById('btn-ir-cuenta-corriente');
    const returnButton = document.getElementById('cc-volver-ventas');
    const list = document.getElementById('cc-lista-clientes');
    const search = document.getElementById('cc-buscar');
    const totalClients = document.getElementById('cc-total-clientes');
    const totalBalances = document.getElementById('cc-total-saldos');
    const detail = document.getElementById('cc-cliente-detalle');
    const nameDetail = document.getElementById('cc-detalle-nombre');
    const balanceDetail = document.getElementById('cc-detalle-saldo');
    const closeDetail = document.getElementById('cc-cerrar-cliente');
    const consume = document.getElementById('cc-consumir');
    const historyButton = document.getElementById('cc-ver-historial');
    const historyWrap = document.getElementById('cc-historial-contenedor');
    const historyContent = document.getElementById('cc-historial');
    const creditForm = document.getElementById('cc-cargar-saldo-form');
    const creditAmount = document.getElementById('cc-anticipo-monto');
    const creditMethod = document.getElementById('cc-anticipo-medio');
    const creditSave = document.getElementById('cc-anticipo-confirmar');
    const message = document.getElementById('cc-mensaje');

    const clientModal = document.getElementById('cc-cliente-modal');
    const clientForm = document.getElementById('cc-cliente-form');
    const clientIdInput = document.getElementById('cc-cliente-id');
    const clientName = document.getElementById('cc-cliente-nombre');
    const clientPhone = document.getElementById('cc-cliente-telefono');
    const clientNotes = document.getElementById('cc-cliente-notas');
    const clientTitle = document.getElementById('cc-modal-titulo');
    const clientSave = document.getElementById('cc-cliente-guardar');
    const clientCancel = document.getElementById('cc-cliente-cancelar');

    let clients = [];
    let selectedId = null;
    let unsubscribe = null;
    let pendingDeposit = null;

    const activeClient = () => clients.find(client => client.id === selectedId) || null;
    const setMessage = text => {
        if (message) message.textContent = text;
    };

    const renderClientDetail = () => {
        const client = activeClient();
        if (!detail) return;
        detail.hidden = !client;
        if (!client) return;
        if (nameDetail) nameDetail.textContent = client.nombre || 'Sin nombre';
        if (balanceDetail) balanceDetail.textContent = formatMoney(client.saldoCentavos);
    };

    const renderClients = () => {
        const total = clients.reduce((sum, client) => sum + Number(client.saldoCentavos || 0), 0);
        if (totalClients) totalClients.textContent = String(clients.length);
        if (totalBalances) totalBalances.textContent = formatMoney(total);

        const term = String(search?.value || '').trim().toLocaleLowerCase('es');
        const filtered = clients.filter(client =>
            `${client.nombre || ''} ${client.telefono || ''}`.toLocaleLowerCase('es').includes(term)
        );

        if (!list) return;
        list.innerHTML = filtered.length ? filtered.map(client => `
            <tr class="${selectedId === client.id ? 'is-selected' : ''}">
                <td>
                    <strong>${escapeHtml(client.nombre || 'Sin nombre')}</strong>
                    <small>${escapeHtml(client.telefono || '')}</small>
                </td>
                <td><b>${formatMoney(client.saldoCentavos)}</b></td>
                <td>${humanDate(client.ultimoMovimientoAt)}</td>
                <td>
                    <div class="ds-cc-cell-actions">
                        <button type="button" data-cc-action="edit" data-id="${escapeAttribute(client.id)}">Editar</button>
                        <button type="button" data-cc-action="history" data-id="${escapeAttribute(client.id)}">Historial</button>
                        <button type="button" data-cc-action="view" data-id="${escapeAttribute(client.id)}">Saldo</button>
                    </div>
                </td>
            </tr>
        `).join('') : '<tr><td colspan="4">No hay clientes con esa búsqueda. Podés crear uno nuevo.</td></tr>';
        renderClientDetail();
    };

    const start = () => {
        if (unsubscribe) return;
        unsubscribe = onSnapshot(query(clientCollection), snapshot => {
            clients = snapshot.docs.map(item => ({ id: item.id, ...item.data() }));
            clients.sort((a, b) =>
                String(a.nombre || '').localeCompare(String(b.nombre || ''), 'es')
            );
            renderClients();
        }, error => {
            console.error('Error leyendo cuentas corrientes:', error);
            setMessage('No se pudieron cargar los clientes. Revisá permisos de Mostrador y conexión.');
        });
    };

    const setSelected = id => {
        selectedId = id;
        if (historyWrap) historyWrap.hidden = true;
        renderClients();
        if (detail && !detail.hidden) {
            detail.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        }
    };

    const renderHistory = async () => {
        const client = activeClient();
        if (!client || !historyWrap || !historyContent) return;
        historyWrap.hidden = false;
        historyContent.innerHTML = '<p>Cargando movimientos…</p>';
        const expectedId = client.id;

        try {
            const snapshot = await getDocs(query(movementCollection, where('clienteId', '==', expectedId)));
            if (selectedId !== expectedId) return;
            const movements = snapshot.docs
                .map(item => ({ id: item.id, ...item.data() }))
                .sort((a, b) => (b.fecha?.seconds || 0) - (a.fecha?.seconds || 0));

            historyContent.innerHTML = movements.length ? movements.map(item => {
                const deposit = item.tipo === 'anticipo';
                const positive = deposit ? '+' : '−';
                return `
                    <div class="ds-cc-movement ${deposit ? 'is-credit' : 'is-debit'}">
                        <div>
                            <strong>${deposit ? 'Anticipo' : 'Retiro de productos'}</strong>
                            <small>${humanDate(item.fecha)} · ${escapeHtml(item.medioPago || (deposit ? '—' : 'Consumo'))}</small>
                            <small>Caja ${escapeHtml(item.cajaId || '—')} ${item.ventaId ? '· Ticket ' + escapeHtml(item.ventaId) : ''}</small>
                        </div>
                        <div>
                            <b>${positive}${formatMoney(item.montoCentavos)}</b>
                            <small>Saldo: ${formatMoney(item.saldoPosteriorCentavos)}</small>
                        </div>
                    </div>
                `;
            }).join('') : '<p>No hay movimientos todavía.</p>';
        } catch (error) {
            console.error('Error leyendo historial de cuenta corriente:', error);
            historyContent.textContent = 'No se pudo cargar el historial.';
        }
    };

    const openClientForm = client => {
        if (!clientForm || !clientModal) return;
        clientForm.reset();
        clientIdInput.value = client?.id || '';
        clientName.value = client?.nombre || '';
        clientPhone.value = client?.telefono || '';
        clientNotes.value = client?.notas || '';
        if (clientTitle) clientTitle.textContent = client ? 'Editar cliente' : 'Nuevo cliente';
        clientModal.classList.add('visible');
        clientName.focus();
    };

    const closeClientModal = () => clientModal?.classList.remove('visible');

    openButton?.addEventListener('click', () => {
        start();
        setMessage('');
        onOpen();
        window.scrollTo(0, 0);
    });
    returnButton?.addEventListener('click', () => {
        onReturn();
        window.scrollTo(0, 0);
    });
    closeDetail?.addEventListener('click', () => setSelected(null));
    search?.addEventListener('input', renderClients);
    document.getElementById('cc-nuevo-cliente')?.addEventListener('click', () => openClientForm(null));
    clientCancel?.addEventListener('click', closeClientModal);

    clientForm?.addEventListener('submit', async event => {
        event.preventDefault();
        const nombre = clientName.value.trim();
        if (!nombre) return;
        clientSave.disabled = true;
        try {
            if (clientIdInput.value) {
                await updateDoc(doc(db, 'ccClientes', clientIdInput.value), {
                    nombre,
                    telefono: clientPhone.value.trim(),
                    notas: clientNotes.value.trim(),
                    updatedAt: Timestamp.now()
                });
            } else {
                const ref = await addDoc(clientCollection, {
                    nombre,
                    telefono: clientPhone.value.trim(),
                    notas: clientNotes.value.trim(),
                    saldoCentavos: 0,
                    activo: true,
                    createdAt: Timestamp.now(),
                    updatedAt: Timestamp.now()
                });
                selectedId = ref.id;
            }
            closeClientModal();
            setMessage('Cliente guardado correctamente.');
        } catch (error) {
            console.error('Error al guardar cliente:', error);
            alert('No se pudo guardar el cliente.');
        } finally {
            clientSave.disabled = false;
        }
    });

    list?.addEventListener('click', event => {
        const button = event.target.closest('[data-cc-action]');
        if (!button) return;
        const client = clients.find(item => item.id === button.dataset.id);
        if (!client) return;
        if (button.dataset.ccAction === 'edit') {
            openClientForm(client);
            return;
        }
        setSelected(client.id);
        if (button.dataset.ccAction === 'history') renderHistory();
    });

    historyButton?.addEventListener('click', renderHistory);

    creditForm?.addEventListener('submit', async event => {
        event.preventDefault();
        const client = activeClient();
        const caja = getCaja();
        const user = getUser();
        const cents = toCents(creditAmount?.value);
        const method = creditMethod?.value;
        if (!client || !caja?.id || !user?.uid) {
            alert('Debés seleccionar un cliente y tener una caja abierta.');
            return;
        }
        if (!Number.isSafeInteger(cents) || cents <= 0 || cents > 10000000000
            || !['Efectivo', 'MercadoPago'].includes(method)) {
            alert('Ingresá un importe positivo y un medio de pago válido.');
            return;
        }
        if (!window.confirm(`¿Registrar un anticipo de ${formatMoney(cents)} por ${method} para ${client.nombre}?\nEl dinero ingresará en la caja abierta.`)) return;

        creditSave.disabled = true;
        creditSave.textContent = 'Registrando…';
        try {
            const clientRef = doc(db, 'ccClientes', client.id);
            const cajaRef = doc(db, 'cajas', caja.id);
            const fingerprint = JSON.stringify({
                clientId: client.id, cajaId: caja.id, cents, method
            });
            if (!pendingDeposit || pendingDeposit.fingerprint !== fingerprint) {
                pendingDeposit = {
                    fingerprint,
                    movementId: doc(movementCollection).id
                };
            }
            const movementRef = doc(db, 'ccMovimientos', pendingDeposit.movementId);

            await runTransaction(db, async tx => {
                const account = await tx.get(clientRef);
                const drawer = await tx.get(cajaRef);
                const duplicate = await tx.get(movementRef);
                if (duplicate.exists()) {
                    const saved = duplicate.data();
                    if (saved.clienteId !== client.id || saved.cajaId !== caja.id
                        || saved.montoCentavos !== cents || saved.medioPago !== method
                        || saved.tipo !== 'anticipo') {
                        throw new Error('El identificador corresponde a otra operación.');
                    }
                    return { alreadyRegistered: true };
                }
                if (!account.exists() || account.data().activo === false) {
                    throw new Error('La cuenta ya no existe o está inactiva.');
                }
                if (!drawer.exists() || drawer.data().estado !== 'abierta') {
                    throw new Error('La caja ya no está abierta.');
                }
                const before = Number(account.data().saldoCentavos);
                if (!Number.isSafeInteger(before) || before < 0) {
                    throw new Error('El saldo del cliente necesita revisión.');
                }
                const after = before + cents;
                if (!Number.isSafeInteger(after)) throw new Error('Saldo fuera del rango permitido.');
                const cash = method === 'Efectivo' ? fromCents(cents) : 0;
                const mp = method === 'MercadoPago' ? fromCents(cents) : 0;
                const drawerData = drawer.data();
                const now = Timestamp.now();

                tx.update(clientRef, {
                    saldoCentavos: after,
                    ultimoMovimientoId: movementRef.id,
                    ultimoMovimientoAt: now,
                    updatedAt: now
                });
                tx.update(cajaRef, {
                    totalEfectivo: (Number(drawerData.totalEfectivo) || 0) + cash,
                    totalMercadoPago: (Number(drawerData.totalMercadoPago) || 0) + mp,
                    anticiposCC_Efectivo: (Number(drawerData.anticiposCC_Efectivo) || 0) + cash,
                    anticiposCC_MercadoPago: (Number(drawerData.anticiposCC_MercadoPago) || 0) + mp
                });
                tx.set(movementRef, {
                    clienteId: client.id,
                    clienteNombre: account.data().nombre || '',
                    tipo: 'anticipo',
                    montoCentavos: cents,
                    saldoAnteriorCentavos: before,
                    saldoPosteriorCentavos: after,
                    cajaId: caja.id,
                    medioPago: method,
                    fecha: now,
                    usuarioId: user.uid,
                    usuarioNombre: getUserName()
                });
            });

            pendingDeposit = null;
            creditAmount.value = '';
            if (historyWrap && !historyWrap.hidden) await renderHistory();
            setMessage(`Anticipo de ${formatMoney(cents)} registrado en caja. No se reconoció como una venta.`);
        } catch (error) {
            console.error('Error al registrar anticipo:', error);
            alert(`No se pudo registrar el anticipo: ${error.message || 'revisá la conexión y los permisos'}`);
        } finally {
            creditSave.disabled = false;
            creditSave.textContent = 'Registrar anticipo en caja';
        }
    });

    consume?.addEventListener('click', () => {
        const client = activeClient();
        if (!client) return;
        const accepted = onSelectForSale(client);
        if (accepted) {
            onReturn();
            window.scrollTo(0, 0);
        }
    });

    return {
        start,
        currentById: id => clients.find(client => client.id === id) || null,
        getSelectedClient: activeClient,
        open: () => openButton?.click(),
        selectClient: setSelected,
        refreshHistory: renderHistory
    };
}
