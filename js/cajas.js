import { 
    getFirestore, collection, onSnapshot, query, orderBy, getDocs, where, updateDoc, doc, Timestamp, deleteDoc, runTransaction 
} from "https://www.gstatic.com/firebasejs/9.15.0/firebase-firestore.js";
import { createAuthorization } from "./core/authorization.js";
import {
    formatCurrency as formatMoneda,
    formatTimestampDateTime,
    formatTimestampShortDate as formatearFechaCorta,
    timestampToMonthKey as formatearMesAnio,
    monthKeyToLabel as nombreMes,
    timestampToLocalDateTimeValue as toLocalDatetimeString
} from "./core/format.js";
import { cashMetricsInfo as infoDiccionario } from "./data/cash-metrics-info.js";
import { escapeHtml, escapeAttribute } from "./core/html.js";
import { calculateRecipeUnitCost } from "./core/pricing.js";
import { setupDecisionCenter } from "./cajas/decision-center.js";

export function setupCajas(app) {
    const db = getFirestore(app);
    const authorization = createAuthorization(app);
    const cajasCollection = collection(db, 'cajas');
    const ventasCollection = collection(db, 'ventasMostrador');
    const auditoriaCollection = collection(db, 'auditoriaMostrador');
    const recetasCollection = collection(db, 'recetas');

    const listaCajasContainer = document.getElementById('lista-cajas-container');
    const filtroMesSelect = document.getElementById('filtro-mes-cajas');
    
    const btnCalcularFacturacion = document.getElementById('btn-calcular-facturacion');
    const calcDesde = document.getElementById('calc-desde');
    const calcHasta = document.getElementById('calc-hasta');
    const resultadoFacturacion = document.getElementById('resultado-facturacion');
    const resTotalMp = document.getElementById('res-total-mp');
    const resFacturadoMp = document.getElementById('res-facturado-mp');
    const resPendienteMp = document.getElementById('res-pendiente-mp');

    const tabBtnHistorial = document.getElementById('tab-btn-historial');
    const tabBtnEstadisticas = document.getElementById('tab-btn-estadisticas');
    const tabBtnDecisiones = document.getElementById('tab-btn-decisiones');
    const sectionHistorial = document.getElementById('section-historial');
    const sectionEstadisticas = document.getElementById('section-estadisticas');
    const sectionDecisiones = document.getElementById('section-decisiones');
    const decisionCenter = setupDecisionCenter(db);

    const modalInfo = document.getElementById('modal-info');
    const infoTitle = document.getElementById('info-title');
    const infoDesc = document.getElementById('info-desc');
    const infoSirve = document.getElementById('info-sirve');
    const infoEj = document.getElementById('info-ej');
    const infoDec = document.getElementById('info-dec');
    const btnCerrarInfo = document.getElementById('btn-cerrar-info');

    // Referencias al Modal de Resumen de Productos
    const modalResumen = document.getElementById('modal-resumen-productos');
    const ulResumenProductos = document.getElementById('ul-resumen-productos');
    const btnCerrarResumen = document.getElementById('btn-cerrar-resumen');

    // Referencias a Papelera
    const btnAbrirPapelera = document.getElementById('btn-abrir-papelera');
    const modalPapelera = document.getElementById('modal-papelera');
    const listaCajasPapelera = document.getElementById('lista-cajas-papelera');
    const btnCerrarPapelera = document.getElementById('btn-cerrar-papelera');

    // Referencias Editar Caja Completa
    const modalEditarCaja = document.getElementById('modal-editar-caja');
    const editCajaId = document.getElementById('edit-caja-id');
    const editCajaFondo = document.getElementById('edit-caja-fondo');
    const editCajaApertura = document.getElementById('edit-caja-apertura');
    const editCajaCierre = document.getElementById('edit-caja-cierre');
    const containerEditCierre = document.getElementById('container-edit-cierre');
    const btnCancelarEditCaja = document.getElementById('btn-cancelar-edit-caja');
    const btnGuardarEditCaja = document.getElementById('btn-guardar-edit-caja');

    // Referencias Editar/Eliminar Ticket
    const modalEditarTicket = document.getElementById('modal-editar-ticket');
    const editTicketId = document.getElementById('edit-ticket-id');
    const editTicketCajaId = document.getElementById('edit-ticket-caja-id');
    const editTicketMonto = document.getElementById('edit-ticket-monto');
    const editTicketMetodo = document.getElementById('edit-ticket-metodo');
    const btnCancelarEditTicket = document.getElementById('btn-cancelar-edit-ticket');
    const btnGuardarEditTicket = document.getElementById('btn-guardar-edit-ticket');
    const btnEliminarTicket = document.getElementById('btn-eliminar-ticket');

    let todasLasCajas = [];
    let cajasEliminadas = []; 
    let statsYaCargadas = false;
    let chartVentasInstancia = null;
    let chartBarHorasInstancia = null;

    const usuarioPuedeAdministrar = authorization.canAdminister;

    // ==========================================
    // 1. DICCIONARIO PARA LA (i) DE TODOS LOS INDICADORES
    // ==========================================


    document.addEventListener('click', (e) => {
        const icon = e.target.closest('.info-icon');
        if (icon) {
            const key = icon.getAttribute('data-info');
            const data = infoDiccionario[key];
            if (data && modalInfo) {
                infoTitle.textContent = data.titulo;
                infoDesc.textContent = data.desc;
                infoSirve.textContent = data.sirve;
                infoEj.textContent = data.ej;
                infoDec.textContent = data.dec;
                modalInfo.classList.add('visible');
            }
        }
    });

    if (btnCerrarInfo) {
        btnCerrarInfo.addEventListener('click', () => {
            modalInfo.classList.remove('visible');
        });
    }

    if (btnCerrarResumen && modalResumen) {
        btnCerrarResumen.addEventListener('click', () => {
            modalResumen.classList.remove('visible');
        });
    }

    // ==========================================
    // 2. GESTIÓN DE PESTAÑAS (TABS)
    // ==========================================
    const setActiveTab = (tab, { updateHash = true } = {}) => {
        const safeTab = ['historial', 'estadisticas', 'decisiones'].includes(tab)
            ? tab
            : 'historial';

        const options = [
            { key: 'historial', button: tabBtnHistorial, section: sectionHistorial },
            { key: 'estadisticas', button: tabBtnEstadisticas, section: sectionEstadisticas },
            { key: 'decisiones', button: tabBtnDecisiones, section: sectionDecisiones }
        ];

        options.forEach(option => {
            option.button?.classList.toggle('active', option.key === safeTab);
            option.button?.setAttribute('aria-selected', String(option.key === safeTab));
            if (option.section) {
                option.section.style.display = option.key === safeTab ? 'block' : 'none';
            }
        });

        if (safeTab === 'estadisticas' && !statsYaCargadas) {
            generarDashboard();
            statsYaCargadas = true;
        }
        if (safeTab === 'decisiones') {
            decisionCenter.show();
        }

        if (updateHash && window.history?.replaceState) {
            window.history.replaceState(null, '', `#${safeTab}`);
        }
    };

    tabBtnHistorial?.addEventListener('click', () => setActiveTab('historial'));
    tabBtnEstadisticas?.addEventListener('click', () => setActiveTab('estadisticas'));
    tabBtnDecisiones?.addEventListener('click', () => setActiveTab('decisiones'));

    window.addEventListener('hashchange', () => {
        const tab = window.location.hash.slice(1);
        if (['historial', 'estadisticas', 'decisiones'].includes(tab)) {
            setActiveTab(tab, { updateHash: false });
        }
    });

    const initialTab = window.location.hash.slice(1);
    if (['estadisticas', 'decisiones'].includes(initialTab)) {
        setActiveTab(initialTab, { updateHash: false });
    }

    const btnCargarStats = document.getElementById('btn-cargar-stats');
    if (btnCargarStats) {
        btnCargarStats.addEventListener('click', generarDashboard);
    }

    // Helpers de Formato compartidos
    const formatearFecha = (timestamp) => {
        if (!timestamp) return 'Fecha desconocida';
        return formatTimestampDateTime(timestamp);
    };

    // ==========================================
    // 3. RENDERIZAR LA LISTA DE CAJAS
    // ==========================================
    function renderizarCajas() {
        const mesFiltro = filtroMesSelect.value;
        listaCajasContainer.innerHTML = '';

        let cajasFiltradas = todasLasCajas;
        if (mesFiltro !== 'todos') {
            cajasFiltradas = todasLasCajas.filter(caja => formatearMesAnio(caja.fechaApertura) === mesFiltro);
        }

        if (cajasFiltradas.length === 0) {
            listaCajasContainer.innerHTML = '<p class="text-light" style="text-align: center; padding: 2rem;">No hay cajas registradas en este período.</p>';
            return;
        }

        cajasFiltradas.forEach(caja => {
            const estadoClase = caja.estado === 'abierta' ? 'estado-abierta' : 'estado-cerrada';
            const estadoTexto = caja.estado === 'abierta' ? '🟢 EN CURSO' : '⚪ CERRADA';
            
            const fondo = caja.fondoInicial || 0;
            const efvo = caja.totalEfectivo || 0;
            const mp = caja.totalMercadoPago || 0;
            const cajaFisica = fondo + efvo;

            const isFacturado = caja.facturadoMP === true;
            const btnFacturadoClass = isFacturado ? 'facturado-true' : 'facturado-false';
            const btnFacturadoText = isFacturado ? '✅ Facturado' : '❌ Marcar Facturado';

            const div = document.createElement('div');
            div.className = 'categoria-acordeon'; 
            div.style.marginBottom = '1.5rem';

            const safeCajaId = escapeAttribute(caja.id);
            const safeUsuario = escapeHtml(caja.usuarioNombre || 'Usuario');

            div.innerHTML = `
                <div class="categoria-acordeon__header caja-header" data-id="${safeCajaId}">
                    <div>
                        <div style="font-size: 1.1rem; display: flex; align-items: center; gap: 0.5rem;">
                            Apertura: ${formatearFecha(caja.fechaApertura)}
                            <button class="btn-editar-caja-datos" data-id="${safeCajaId}" style="background: none; border: none; font-size: 1.1rem; cursor: pointer; color: #8b5cf6;" title="Editar Fechas/Fondo">✏️</button>
                            <button class="btn-eliminar-caja" data-id="${safeCajaId}" style="background: none; border: none; font-size: 1.2rem; cursor: pointer; color: #ef4444;" title="Eliminar caja (Ocultar)">🗑️</button>
                        </div>
                        <div style="font-size: 0.85rem; color: var(--text-light); font-weight: normal; margin-top: 0.2rem;">
                            👤 ${safeUsuario}
                            ${caja.fechaCierre ? ` | Cierre: ${formatearFecha(caja.fechaCierre)}` : ''}
                        </div>
                    </div>
                    <div style="display: flex; align-items: center; gap: 1rem;">
                        <span class="caja-estado ${estadoClase}">${estadoTexto}</span>
                        <span class="acordeon-icono">+</span>
                    </div>
                </div>
                
                <div class="categoria-acordeon__content" style="background: white; padding: 0;">
                    <div style="padding: 1.5rem;">
                        <div class="caja-resumen">
                            <div class="caja-resumen-item">
                                <span>Cambio Inicial</span>
                                <span>${formatMoneda(fondo)}</span>
                            </div>
                            <div class="caja-resumen-item">
                                <span>Ventas Efvo.</span>
                                <span style="color: var(--success-color);">${formatMoneda(efvo)}</span>
                            </div>
                            <div class="caja-resumen-item">
                                <span>Ventas MP</span>
                                <div>
                                    <span style="color: var(--success-color); display: block; margin-bottom: 0.3rem;">${formatMoneda(mp)}</span>
                                    <button class="btn-facturado ${btnFacturadoClass}" data-id="${safeCajaId}" data-estado="${isFacturado}" style="padding: 0.2rem 0.5rem; font-size: 0.75rem; border-radius: 4px; cursor:pointer;">
                                        ${btnFacturadoText}
                                    </button>
                                </div>
                            </div>
                            <div class="caja-resumen-item" style="border-left: 2px solid var(--border-color); padding-left: 1rem;">
                                <span>Efectivo Físico</span>
                                <span style="color: var(--primary-color);">${formatMoneda(cajaFisica)}</span>
                            </div>
                        </div>

                        <div class="ticket-list">
                            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 1rem; flex-wrap: wrap; gap: 0.5rem;">
                                <h3 style="font-size: 1rem; margin: 0;">Detalle de Movimientos</h3>
                                <button class="btn-resumen-productos btn-secondary" data-id="${safeCajaId}" style="width: auto; padding: 0.3rem 0.8rem; font-size: 0.85rem; border-color: #0ea5e9; color: #0ea5e9;">📊 Ver Resumen de Productos</button>
                            </div>
                            <div id="tickets-${safeCajaId}">
                                <p class="text-light" style="font-size: 0.9rem;">Cargando tickets...</p>
                            </div>
                        </div>
                    </div>
                </div>
            `;
            listaCajasContainer.appendChild(div);
        });
    }

    function actualizarFiltros() {
        const mesesUnicos = new Set();
        todasLasCajas.forEach(caja => {
            const mesAnio = formatearMesAnio(caja.fechaApertura);
            if (mesAnio) mesesUnicos.add(mesAnio);
        });

        const valorActual = filtroMesSelect.value;
        filtroMesSelect.innerHTML = '<option value="todos">Todos los meses</option>';

        const mesesOrdenados = Array.from(mesesUnicos).sort().reverse();
        mesesOrdenados.forEach(mesAnio => {
            const option = document.createElement('option');
            option.value = mesAnio;
            option.textContent = nombreMes(mesAnio);
            filtroMesSelect.appendChild(option);
        });

        if (mesesOrdenados.includes(valorActual)) {
            filtroMesSelect.value = valorActual;
        } else if (mesesOrdenados.length > 0 && valorActual !== 'todos') {
            filtroMesSelect.value = mesesOrdenados[0]; 
        }
    }

    onSnapshot(query(cajasCollection, orderBy('fechaApertura', 'desc')), (snapshot) => {
        todasLasCajas = [];
        cajasEliminadas = [];
        
        snapshot.docs.forEach(doc => {
            const data = { id: doc.id, ...doc.data() };
            if (data.eliminada === true) {
                cajasEliminadas.push(data);
            } else {
                todasLasCajas.push(data);
            }
        });
        
        actualizarFiltros();
        renderizarCajas();
        
        if (statsYaCargadas && sectionEstadisticas && sectionEstadisticas.style.display !== 'none') {
            generarDashboard();
        }
    });

    filtroMesSelect.addEventListener('change', renderizarCajas);

    async function cargarTicketsDeCaja(cajaId, container) {
        try {
            const q = query(ventasCollection, where('cajaId', '==', cajaId));
            const querySnapshot = await getDocs(q);
            
            if (querySnapshot.empty) {
                container.innerHTML = '<p class="text-light" style="font-size: 0.9rem;">No hubo movimientos registrados.</p>';
                return;
            }

            let ventas = [];
            querySnapshot.forEach(docSnap => ventas.push({ id: docSnap.id, ...docSnap.data() }));

            ventas.sort((a, b) => {
                if (!a.fecha || !b.fecha) return 0;
                return b.fecha.seconds - a.fecha.seconds;
            });

            container.innerHTML = '';
            ventas.forEach(venta => {
                const itemsTexto = (venta.items || [])
                    .map(item => `${item.cantidad}x ${escapeHtml(item.nombre)}`)
                    .join(', ');

                let tagMP = '';
                if (venta.metodoPago === 'Ambos') {
                    tagMP = `<span class="metodo-pago-tag">Efvo: ${formatMoneda(venta.pagoEfectivo)} | MP: ${formatMoneda(venta.pagoMercadoPago)}</span>`;
                } else {
                    tagMP = `<span class="metodo-pago-tag">${escapeHtml(venta.metodoPago || '')}</span>`;
                }

                const safeVentaId = escapeAttribute(venta.id);
                const safeCajaId = escapeAttribute(cajaId);
                const safeMetodoAttr = escapeAttribute(venta.metodoPago || '');
                const margenHistorico = Number(venta.margenBrutoVentaPct);
                const tieneSnapshotVenta =
                    Number(venta.costoSnapshotVersion) >= 1
                    && Number.isFinite(margenHistorico);
                const margenHistoricoHtml = tieneSnapshotVenta
                    ? `<small class="ds-ticket-margin">Margen bruto histórico: ${margenHistorico.toFixed(1)}%</small>`
                    : '<small class="ds-ticket-margin is-legacy">Venta anterior · costo histórico no guardado</small>';

                const ticketDiv = document.createElement('div');
                ticketDiv.className = 'ticket-item';
                ticketDiv.innerHTML = `
                    <div class="ticket-info">
                        <h4>Hora: ${formatearFecha(venta.fecha).split(',')[1] || ''} ${tagMP}</h4>
                        <p>${itemsTexto}</p>
                        ${margenHistoricoHtml}
                    </div>
                    <div style="display: flex; align-items: center; gap: 1rem;">
                        <span class="ticket-monto">${formatMoneda(venta.total)}</span>
                        ${venta.metodoPago === 'CuentaCorriente'
                            ? '<small class="ds-ticket-margin">Cuenta corriente · no editable desde Cajas</small>'
                            : `<button class="btn-editar-ticket-individual" data-id="${safeVentaId}" data-caja="${safeCajaId}" data-total="${venta.total}" data-metodo="${safeMetodoAttr}" style="background:none; border:none; cursor:pointer; font-size: 1.2rem; color: #8b5cf6;" title="Editar o Eliminar Movimiento">✏️</button>`
                        }
                    </div>
                `;
                container.appendChild(ticketDiv);
            });
        } catch (error) {
            console.error("Error al cargar tickets:", error);
            container.innerHTML = '<p style="color: var(--danger-color); font-size: 0.9rem;">Error al cargar las ventas.</p>';
        }
    }

    async function mostrarResumenProductos(cajaId) {
        if (!ulResumenProductos || !modalResumen) return;

        modalResumen.classList.add('visible');
        ulResumenProductos.innerHTML = '<p class="text-light" style="text-align: center; padding: 2rem;">Calculando resumen...</p>';

        try {
            const q = query(ventasCollection, where('cajaId', '==', cajaId));
            const querySnapshot = await getDocs(q);
            
            if (querySnapshot.empty) {
                ulResumenProductos.innerHTML = '<p class="text-light" style="text-align: center; padding: 2rem;">No hay productos vendidos en este turno.</p>';
                return;
            }

            let conteoProductos = {};
            
            querySnapshot.forEach(docSnap => {
                const venta = docSnap.data();
                (venta.items || []).forEach(item => {
                    const cant = parseInt(item.cantidad) || 0;
                    if (!conteoProductos[item.nombre]) {
                        conteoProductos[item.nombre] = 0;
                    }
                    conteoProductos[item.nombre] += cant;
                });
            });

            let arrProductos = Object.entries(conteoProductos)
                .map(([nombre, cantidad]) => ({ nombre, cantidad }))
                .sort((a, b) => b.cantidad - a.cantidad);

            ulResumenProductos.innerHTML = '';
            arrProductos.forEach((prod, idx) => {
                const li = document.createElement('li');
                li.innerHTML = `
                    <span><strong>#${idx + 1}</strong> ${escapeHtml(prod.nombre)}</span>
                    <span style="color:#0ea5e9; font-weight:bold;">${prod.cantidad} u.</span>
                `;
                ulResumenProductos.appendChild(li);
            });

        } catch (error) {
            console.error("Error al generar resumen:", error);
            ulResumenProductos.innerHTML = '<p style="color: var(--danger-color); text-align: center;">Error al calcular el resumen.</p>';
        }
    }

    // ==========================================
    // DELEGACIÓN DE EVENTOS: CAJAS Y TICKETS
    // ==========================================
    listaCajasContainer.addEventListener('click', async (e) => {
        
        // 1. ELIMINAR CAJA (Soft Delete)
        if (e.target.closest('.btn-eliminar-caja')) {
            e.stopPropagation(); 
            const btn = e.target.closest('.btn-eliminar-caja');
            const cajaId = btn.dataset.id;
            
            const cajaConAnticipos = [...todasLasCajas, ...cajasEliminadas]
                .find(caja => caja.id === cajaId);
            if (cajaConAnticipos &&
                ((Number(cajaConAnticipos.anticiposCC_Efectivo) || 0) > 0
                  || (Number(cajaConAnticipos.anticiposCC_MercadoPago) || 0) > 0
                  || (Number(cajaConAnticipos.ventasCuentaCorriente) || 0) > 0)) {
                alert('No se puede ocultar una caja que tiene anticipos o consumos de cuenta corriente. Se preserva la trazabilidad del saldo.');
                return;
            }

            if (!(await usuarioPuedeAdministrar())) {
                alert("Tu usuario no tiene permisos para eliminar una caja.");
                return;
            }

            try {
                await updateDoc(doc(db, 'cajas', cajaId), { eliminada: true });
                alert("Caja movida a la papelera exitosamente.");
            } catch(err) {
                alert("Error de conexión al intentar borrar.");
            }
            return;
        }

        // 2. EDITAR DATOS DE LA CAJA (Fechas y Fondo)
        if (e.target.closest('.btn-editar-caja-datos')) {
            e.stopPropagation(); 
            const btn = e.target.closest('.btn-editar-caja-datos');
            const cajaId = btn.dataset.id;
            const caja = todasLasCajas.find(c => c.id === cajaId);
            if(!caja) return;

            if (!(await usuarioPuedeAdministrar())) {
                alert("Tu usuario no tiene permisos para modificar datos sensibles de caja.");
                return;
            }

            editCajaId.value = caja.id;
            editCajaFondo.value = caja.fondoInicial || 0;
            editCajaApertura.value = toLocalDatetimeString(caja.fechaApertura);
            
            if (caja.estado === 'cerrada' && caja.fechaCierre) {
                containerEditCierre.style.display = 'block';
                editCajaCierre.value = toLocalDatetimeString(caja.fechaCierre);
            } else {
                containerEditCierre.style.display = 'none';
                editCajaCierre.value = '';
            }

            modalEditarCaja.classList.add('visible');
            return;
        }

        // 3. EDITAR TICKET INDIVIDUAL (Desde adentro del acordeón)
        if (e.target.closest('.btn-editar-ticket-individual')) {
            const btn = e.target.closest('.btn-editar-ticket-individual');
            
            if (!(await usuarioPuedeAdministrar())) {
                alert("Tu usuario no tiene permisos para modificar movimientos.");
                return;
            }

            editTicketId.value = btn.dataset.id;
            editTicketCajaId.value = btn.dataset.caja;
            editTicketMonto.value = btn.dataset.total;
            editTicketMetodo.value = btn.dataset.metodo === 'Ambos' ? 'Efectivo' : btn.dataset.metodo;
            
            modalEditarTicket.classList.add('visible');
            return;
        }

        // 4. FACTURADO MP
        if (e.target.closest('.btn-facturado')) {
            const btn = e.target.closest('.btn-facturado');
            const cajaId = btn.dataset.id;
            const estadoActual = btn.dataset.estado === 'true';

            try {
                btn.textContent = "..."; 
                await updateDoc(doc(db, 'cajas', cajaId), { facturadoMP: !estadoActual });
            } catch (err) { alert("Hubo un error de conexión."); }
            return; 
        }

        // 5. RESUMEN PRODUCTOS
        if (e.target.closest('.btn-resumen-productos')) {
            const btn = e.target.closest('.btn-resumen-productos');
            mostrarResumenProductos(btn.dataset.id);
            return;
        }

        // 6. ABRIR ACORDEÓN
        const header = e.target.closest('.caja-header');
        if (!header) return;

        const acordeon = header.parentElement;
        const cajaId = header.dataset.id;
        const ticketsContainer = document.getElementById(`tickets-${cajaId}`);
        const icono = header.querySelector('.acordeon-icono');

        const estaActivo = acordeon.classList.contains('active');
        
        document.querySelectorAll('.categoria-acordeon').forEach(el => {
            el.classList.remove('active');
            el.querySelector('.acordeon-icono').textContent = '+';
        });

        if (!estaActivo) {
            acordeon.classList.add('active');
            icono.textContent = '-';
            
            if (ticketsContainer.innerHTML.includes('Cargando')) {
                await cargarTicketsDeCaja(cajaId, ticketsContainer);
            }
        }
    });

    // ==========================================
    // LÓGICA DE MODALES DE EDICIÓN
    // ==========================================

    // GUARDAR CAJA COMPLETA
    if (btnCancelarEditCaja) btnCancelarEditCaja.addEventListener('click', () => modalEditarCaja.classList.remove('visible'));
    if (btnGuardarEditCaja) {
        btnGuardarEditCaja.addEventListener('click', async () => {
            const cajaId = editCajaId.value;
            const nuevoFondo = parseFloat(editCajaFondo.value) || 0;
            const fApeStr = editCajaApertura.value;
            const fCieStr = editCajaCierre.value;

            if(!fApeStr) return alert("La fecha de apertura es obligatoria.");

            btnGuardarEditCaja.disabled = true;
            btnGuardarEditCaja.textContent = "Guardando...";

            try {
                let updates = {
                    fondoInicial: nuevoFondo,
                    fechaApertura: Timestamp.fromDate(new Date(fApeStr))
                };

                if (containerEditCierre.style.display === 'block' && fCieStr) {
                    updates.fechaCierre = Timestamp.fromDate(new Date(fCieStr));
                }

                await updateDoc(doc(db, 'cajas', cajaId), updates);
                alert("Caja actualizada.");
                modalEditarCaja.classList.remove('visible');
            } catch(e) {
                alert("Error al actualizar la caja.");
            }
            
            btnGuardarEditCaja.disabled = false;
            btnGuardarEditCaja.textContent = "💾 Guardar Cambios";
        });
    }

    // GUARDAR O ELIMINAR TICKET
    if (btnCancelarEditTicket) btnCancelarEditTicket.addEventListener('click', () => modalEditarTicket.classList.remove('visible'));
    
    if (btnGuardarEditTicket) {
        btnGuardarEditTicket.addEventListener('click', async () => {
            const ticketId = editTicketId.value;
            const cajaId = editTicketCajaId.value;
            const nuevoMetodo = editTicketMetodo.value;
            const nuevoTotal = parseFloat(editTicketMonto.value) || 0;
            
            if(nuevoTotal < 0) return alert("El monto no puede ser negativo.");

            btnGuardarEditTicket.disabled = true;
            btnGuardarEditTicket.textContent = 'Actualizando...';

            try {
                await runTransaction(db, async (transaction) => {
                    const ticketRef = doc(db, 'ventasMostrador', ticketId);
                    const cajaRef = doc(db, 'cajas', cajaId);
                    const ticketDoc = await transaction.get(ticketRef);
                    const cajaDoc = await transaction.get(cajaRef);
                    if (!ticketDoc.exists()) throw "Ticket no encontrado";

                    const tData = ticketDoc.data();
                    if (tData.metodoPago === 'CuentaCorriente') {
                        throw new Error('Los consumos de saldo no se pueden editar desde Cajas.');
                    }
                    const viejoMetodo = tData.metodoPago;
                    const viejoTotal = tData.total || 0;

                    // Si no cambió nada, salimos
                    if (viejoMetodo === nuevoMetodo && viejoTotal === nuevoTotal) return;

                    // Calculamos la diferencia que hay que inyectar/sacar de la caja
                    let difEfvo = 0; let difMP = 0;

                    // 1. Restamos lo viejo
                    if (viejoMetodo === 'Efectivo') difEfvo -= viejoTotal;
                    else if (viejoMetodo === 'MercadoPago') difMP -= viejoTotal;
                    else if (viejoMetodo === 'Ambos') {
                        difEfvo -= (tData.pagoEfectivo || 0);
                        difMP -= (tData.pagoMercadoPago || 0);
                    }

                    // 2. Sumamos lo nuevo (El modal lo simplifica a 1 solo método)
                    if (nuevoMetodo === 'Efectivo') difEfvo += nuevoTotal;
                    else if (nuevoMetodo === 'MercadoPago') difMP += nuevoTotal;

                    const itemsOriginales = Array.isArray(tData.items) ? tData.items : [];
                    const totalLineasAnterior = itemsOriginales.reduce(
                        (sum, item) => sum + ((Number(item.precio) || 0) * (Number(item.cantidad) || 0)),
                        0
                    );
                    const factorPrecio = totalLineasAnterior > 0
                        ? nuevoTotal / totalLineasAnterior
                        : 1;

                    const itemsActualizados = itemsOriginales.map(item => {
                        const cantidad = Number(item.cantidad) || 0;
                        const precioAnterior = Number(item.precio) || 0;
                        const nuevoPrecioUnitario = precioAnterior * factorPrecio;
                        const costoUnitarioVenta = Number(item.costoUnitarioVenta);
                        const tieneSnapshotItem =
                            Number(item.costoSnapshotVersion) >= 1
                            && Number.isFinite(costoUnitarioVenta)
                            && costoUnitarioVenta >= 0;

                        if (!tieneSnapshotItem) {
                            return { ...item, precio: nuevoPrecioUnitario };
                        }

                        const costoTotalItem = costoUnitarioVenta * cantidad;
                        const facturacionItem = nuevoPrecioUnitario * cantidad;
                        const utilidadBrutaItem = facturacionItem - costoTotalItem;
                        const margenBrutoItem = facturacionItem > 0
                            ? (utilidadBrutaItem / facturacionItem) * 100
                            : 0;

                        return {
                            ...item,
                            precio: nuevoPrecioUnitario,
                            costoTotalVenta: costoTotalItem,
                            utilidadBrutaVenta: utilidadBrutaItem,
                            margenBrutoVentaPct: margenBrutoItem
                        };
                    });

                    const itemsConSnapshot = itemsActualizados.filter(item =>
                        Number(item.costoSnapshotVersion) >= 1
                        && Number.isFinite(Number(item.costoTotalVenta))
                    );
                    const todosConSnapshot =
                        itemsActualizados.length > 0
                        && itemsConSnapshot.length === itemsActualizados.length;
                    const costoTotalVenta = todosConSnapshot
                        ? itemsConSnapshot.reduce((sum, item) => sum + Number(item.costoTotalVenta || 0), 0)
                        : null;
                    const utilidadBrutaVenta = todosConSnapshot
                        ? nuevoTotal - costoTotalVenta
                        : null;
                    const margenBrutoVentaPct = todosConSnapshot && nuevoTotal > 0
                        ? (utilidadBrutaVenta / nuevoTotal) * 100
                        : null;

                    // Actualizamos el ticket. El costo histórico no cambia;
                    // si corregimos el total cobrado, sí cambian utilidad y margen.
                    const ticketUpdate = {
                        metodoPago: nuevoMetodo,
                        total: nuevoTotal,
                        pagoEfectivo: nuevoMetodo === 'Efectivo' ? nuevoTotal : 0,
                        pagoMercadoPago: nuevoMetodo === 'MercadoPago' ? nuevoTotal : 0,
                        items: itemsActualizados
                    };

                    if (todosConSnapshot) {
                        ticketUpdate.costoTotalVenta = costoTotalVenta;
                        ticketUpdate.utilidadBrutaVenta = utilidadBrutaVenta;
                        ticketUpdate.margenBrutoVentaPct = margenBrutoVentaPct;
                        ticketUpdate.costoSnapshotVersion = 1;
                    }

                    transaction.update(ticketRef, ticketUpdate);

                    // Actualizamos la caja
                    if(cajaDoc.exists()) {
                        const cData = cajaDoc.data();
                        transaction.update(cajaRef, {
                            totalEfectivo: (cData.totalEfectivo || 0) + difEfvo,
                            totalMercadoPago: (cData.totalMercadoPago || 0) + difMP
                        });
                    }
                });

                alert("Ticket corregido con éxito.");
                modalEditarTicket.classList.remove('visible');
                
                // Forzamos la recarga de los tickets en la vista
                const ticketsContainer = document.getElementById(`tickets-${cajaId}`);
                if (ticketsContainer) await cargarTicketsDeCaja(cajaId, ticketsContainer);

            } catch (err) {
                console.error("Error editando ticket", err);
                alert("No se pudo editar: " + err);
            }

            btnGuardarEditTicket.disabled = false;
            btnGuardarEditTicket.textContent = '💾 Actualizar Venta';
        });
    }

    if (btnEliminarTicket) {
        btnEliminarTicket.addEventListener('click', async () => {
            const ticketId = editTicketId.value;
            const cajaId = editTicketCajaId.value;

            const seguro = confirm("⚠️ ¿Estás totalmente seguro de eliminar este movimiento? La plata se descontará de la caja.");
            if (!seguro) return;

            btnEliminarTicket.disabled = true;
            btnEliminarTicket.textContent = 'Borrando...';

            try {
                await runTransaction(db, async (transaction) => {
                    const ticketRef = doc(db, 'ventasMostrador', ticketId);
                    const ticketDoc = await transaction.get(ticketRef);
                    if (!ticketDoc.exists()) throw "El ticket ya no existe.";
                    
                    const tData = ticketDoc.data();
                    if (tData.metodoPago === 'CuentaCorriente') {
                        throw new Error('Los consumos de saldo no se pueden eliminar desde Cajas.');
                    }

                    let aRestarEfvo = 0; let aRestarMP = 0;
                    if (tData.metodoPago === 'Efectivo') aRestarEfvo = tData.total;
                    else if (tData.metodoPago === 'MercadoPago') aRestarMP = tData.total;
                    else if (tData.metodoPago === 'Ambos') {
                        aRestarEfvo = tData.pagoEfectivo || 0;
                        aRestarMP = tData.pagoMercadoPago || 0;
                    }

                    // Restamos de la caja
                    const cajaRef = doc(db, 'cajas', cajaId);
                    const cajaDoc = await transaction.get(cajaRef);
                    if(cajaDoc.exists()) {
                        const cData = cajaDoc.data();
                        transaction.update(cajaRef, {
                            totalEfectivo: (cData.totalEfectivo || 0) - aRestarEfvo,
                            totalMercadoPago: (cData.totalMercadoPago || 0) - aRestarMP
                        });
                    }

                    // Finalmente borramos el ticket físicamente de la base
                    transaction.delete(ticketRef);
                });

                alert("Movimiento eliminado exitosamente.");
                modalEditarTicket.classList.remove('visible');
                
                const ticketsContainer = document.getElementById(`tickets-${cajaId}`);
                if (ticketsContainer) await cargarTicketsDeCaja(cajaId, ticketsContainer);

            } catch(e) {
                console.error(e);
                alert("Error al intentar borrar el movimiento.");
            }

            btnEliminarTicket.disabled = false;
            btnEliminarTicket.textContent = '🗑️ Eliminar';
        });
    }

    // ==========================================
    // 3.5 GESTIÓN DE LA PAPELERA (RESTAURAR CAJAS)
    // ==========================================
    if (btnAbrirPapelera) {
        btnAbrirPapelera.addEventListener('click', () => {
            if(modalPapelera) modalPapelera.classList.add('visible');
            renderizarPapelera();
        });
    }

    if (btnCerrarPapelera) {
        btnCerrarPapelera.addEventListener('click', () => {
            if(modalPapelera) modalPapelera.classList.remove('visible');
        });
    }

    function renderizarPapelera() {
        if (!listaCajasPapelera) return;
        listaCajasPapelera.innerHTML = '';

        if (cajasEliminadas.length === 0) {
            listaCajasPapelera.innerHTML = '<p class="text-light" style="text-align: center; padding: 2rem;">La papelera está vacía.</p>';
            return;
        }

        cajasEliminadas.forEach(caja => {
            const efvo = caja.totalEfectivo || 0;
            const mp = caja.totalMercadoPago || 0;
            const total = efvo + mp;
            const safeCajaId = escapeAttribute(caja.id);
            const safeUsuario = escapeHtml(caja.usuarioNombre || 'Sistema');

            const div = document.createElement('div');
            div.style.background = 'white';
            div.style.border = '1px solid #e2e8f0';
            div.style.padding = '1rem';
            div.style.borderRadius = '8px';
            div.style.marginBottom = '0.8rem';
            div.style.display = 'flex';
            div.style.justifyContent = 'space-between';
            div.style.alignItems = 'center';

            div.innerHTML = `
                <div>
                    <strong style="color: #475569;">${formatearFecha(caja.fechaApertura)}</strong>
                    <div style="font-size: 0.85rem; color: #64748b; margin-top: 0.2rem;">👤 ${safeUsuario} | 💰 Total: ${formatMoneda(total)}</div>
                </div>
                <button class="btn-restaurar-caja btn-primary" data-id="${safeCajaId}" style="width: auto; padding: 0.5rem 1rem; font-size: 0.9rem; background: #10b981; border-color: #10b981;">♻️ Restaurar</button>
            `;
            listaCajasPapelera.appendChild(div);
        });
    }

    if (listaCajasPapelera) {
        listaCajasPapelera.addEventListener('click', async (e) => {
            if (e.target.closest('.btn-restaurar-caja')) {
                const btn = e.target.closest('.btn-restaurar-caja');
                const cajaId = btn.dataset.id;

                if (!(await usuarioPuedeAdministrar())) {
                    alert("Tu usuario no tiene permisos para restaurar cajas.");
                    return;
                }

                try {
                    btn.textContent = "...";
                    await updateDoc(doc(db, 'cajas', cajaId), { eliminada: false });
                    alert("Caja restaurada al historial con éxito.");
                    renderizarPapelera(); 
                } catch(err) {
                    alert("Error al intentar restaurar.");
                    btn.textContent = "♻️ Restaurar";
                }
            }
        });
    }


    // ==========================================
    // 4. LÓGICA DE LA CALCULADORA DE FACTURACIÓN
    // ==========================================
    if (btnCalcularFacturacion) {
        btnCalcularFacturacion.addEventListener('click', () => {
            const desdeStr = calcDesde.value;
            const hastaStr = calcHasta.value;

            if (!desdeStr || !hastaStr) {
                alert("Por favor, seleccioná la fecha 'Desde' y 'Hasta'.");
                return;
            }

            const dInicio = new Date(`${desdeStr}T00:00:00`);
            const dFin = new Date(`${hastaStr}T23:59:59`);

            let acumuladoTotalMP = 0;
            let acumuladoFacturadoMP = 0;

            todasLasCajas.forEach(caja => {
                if (caja.fechaApertura) {
                    const dCaja = caja.fechaApertura.toDate();
                    
                    if (dCaja >= dInicio && dCaja <= dFin) {
                        const mp = Math.max(0,
                            (Number(caja.totalMercadoPago) || 0)
                            - (Number(caja.anticiposCC_MercadoPago) || 0)
                        );
                        acumuladoTotalMP += mp;
                        
                        if (caja.facturadoMP === true) {
                            acumuladoFacturadoMP += mp;
                        }
                    }
                }
            });

            const pendienteFacturar = acumuladoTotalMP - acumuladoFacturadoMP;

            resTotalMp.textContent = formatMoneda(acumuladoTotalMP);
            resFacturadoMp.textContent = formatMoneda(acumuladoFacturadoMP);
            resPendienteMp.textContent = formatMoneda(pendienteFacturar);

            resultadoFacturacion.style.display = 'grid';
        });
    }

    // ==========================================
    // 5. MATEMÁTICA Y DASHBOARD ESTADÍSTICO DE BI
    // ==========================================
    async function generarDashboard() {
        const statsLoading = document.getElementById('stats-loading');
        const statsContent = document.getElementById('stats-content');
        
        if (statsLoading) statsLoading.style.display = 'block';
        if (statsContent) statsContent.style.display = 'none';

        try {
            const [ventasSnap, auditSnap, recetasSnap, materiasSnap] = await Promise.all([
                getDocs(collection(db, 'ventasMostrador')),
                getDocs(collection(db, 'auditoriaMostrador')),
                getDocs(collection(db, 'recetas')),
                getDocs(collection(db, 'materiasPrimas'))
            ]);

            // Filtrar ventas huérfanas (cuyas cajas fueron borradas)
            const cajasOcultasIDs = new Set(cajasEliminadas.map(c => c.id));

            let ventasArray = [];
            ventasSnap.forEach(v => {
                const dataVenta = v.data();
                if (!cajasOcultasIDs.has(dataVenta.cajaId)) {
                    ventasArray.push(dataVenta);
                }
            });
            ventasArray.sort((a,b) => (a.fecha?.seconds || 0) - (b.fecha?.seconds || 0));

            let auditArray = [];
            auditSnap.forEach(a => auditArray.push(a.data()));

            const materiasMap = new Map();
            materiasSnap.forEach(m => materiasMap.set(m.id, m.data()));

            let recetasMap = new Map();
            recetasSnap.forEach(r => {
                let rd = r.data();
                const costoDinamico = calculateRecipeUnitCost(rd, materiasMap);
                const costoGuardado = parseFloat(rd.costoPorcion) || (parseFloat(rd.costoTotal) / parseFloat(rd.porcionesReceta)) || 0;
                const costoUnit = costoDinamico > 0 ? costoDinamico : costoGuardado;
                
                recetasMap.set(rd.nombreTorta, { 
                    categoria: rd.categoria || 'Otros', 
                    margen: parseFloat(rd.margenIndividual) || 0,
                    costoUnitario: costoUnit
                });

            });

            const timestampMillis = (value) => {
                if (!value) return 0;
                if (typeof value.toMillis === 'function') return value.toMillis();
                if (value.seconds !== undefined) return Number(value.seconds) * 1000;
                const date = new Date(value);
                return Number.isNaN(date.getTime()) ? 0 : date.getTime();
            };

            const renderizarFluctuacionesCostos = () => {
                const tbody = document.querySelector('#tabla-fluctuacion-costos tbody');
                const resumen = document.getElementById('resumen-fluctuacion-costos');
                if (!tbody) return;

                const ahora = Date.now();
                const hace30Dias = ahora - (30 * 24 * 60 * 60 * 1000);
                const filas = [];

                materiasSnap.forEach(snapshotMateria => {
                    const materia = snapshotMateria.data();
                    const historial = Array.isArray(materia.historialPreciosProveedor)
                        ? [...materia.historialPreciosProveedor]
                        : [];
                    const costoActual = Number(materia.proveedorCostoUnitarioActual)
                        || Number(materia.costoReferenciaProveedorUnitario)
                        || 0;

                    if (!historial.length && costoActual <= 0) return;

                    const cambios = historial
                        .filter(item => Math.abs(Number(item.variacionPct) || 0) > 0.001)
                        .sort((a, b) => timestampMillis(b.fecha) - timestampMillis(a.fecha));

                    const ultimoCambio = cambios[0] || historial[0] || null;
                    const ultimaVariacion = Number(ultimoCambio?.variacionPct);
                    const cambios30 = cambios.filter(item => timestampMillis(item.fecha) >= hace30Dias).length;

                    let promedioDias = null;
                    if (cambios.length >= 2) {
                        const intervalos = [];
                        for (let index = 0; index < cambios.length - 1; index += 1) {
                            const actual = timestampMillis(cambios[index].fecha);
                            const anterior = timestampMillis(cambios[index + 1].fecha);
                            if (actual > 0 && anterior > 0 && actual > anterior) {
                                intervalos.push((actual - anterior) / (24 * 60 * 60 * 1000));
                            }
                        }
                        if (intervalos.length) {
                            promedioDias = intervalos.reduce((sum, value) => sum + value, 0) / intervalos.length;
                        }
                    }

                    filas.push({
                        nombre: materia.nombre || 'Materia prima',
                        unidad: materia.unidad || 'unidad',
                        costoActual,
                        ultimaVariacion: Number.isFinite(ultimaVariacion) ? ultimaVariacion : null,
                        ultimoCambioFecha: ultimoCambio?.fecha || materia.proveedorUltimaConsulta || null,
                        cambios30,
                        promedioDias,
                        totalCambios: cambios.length
                    });
                });

                filas.sort((a, b) => {
                    const aSignificativa = Math.abs(Number(a.ultimaVariacion) || 0) >= 10 ? 1 : 0;
                    const bSignificativa = Math.abs(Number(b.ultimaVariacion) || 0) >= 10 ? 1 : 0;
                    if (aSignificativa !== bSignificativa) return bSignificativa - aSignificativa;
                    return timestampMillis(b.ultimoCambioFecha) - timestampMillis(a.ultimoCambioFecha);
                });

                if (!filas.length) {
                    tbody.innerHTML = '<tr><td colspan="5" style="text-align:center; color:#94a3b8;">Sin historial de proveedores todavía.</td></tr>';
                    if (resumen) resumen.textContent = 'Sin datos todavía';
                    return;
                }

                const aumentosFuertes30 = filas.filter(fila =>
                    Number(fila.ultimaVariacion) >= 10
                    && timestampMillis(fila.ultimoCambioFecha) >= hace30Dias
                ).length;

                if (resumen) {
                    resumen.textContent = `${filas.length} materias monitoreadas · ${aumentosFuertes30} aumentos ≥10% en 30 días`;
                }

                tbody.innerHTML = filas.map(fila => {
                    const variacion = fila.ultimaVariacion;
                    const significativa = Number.isFinite(variacion) && Math.abs(variacion) >= 10;
                    const variacionClase = significativa
                        ? 'is-alert'
                        : Number(variacion) > 0
                            ? 'is-up'
                            : Number(variacion) < 0
                                ? 'is-down'
                                : 'is-same';
                    const variacionTexto = Number.isFinite(variacion)
                        ? `${significativa ? '⚠ ' : ''}${variacion > 0 ? '+' : ''}${variacion.toFixed(2)}%`
                        : 'Inicial';
                    const fechaTexto = fila.ultimoCambioFecha
                        ? formatTimestampDateTime(fila.ultimoCambioFecha, { shortYear: true })
                        : 'Sin cambio registrado';
                    const frecuenciaTexto = fila.totalCambios >= 2 && fila.promedioDias !== null
                        ? `${fila.cambios30} cambios / 30d · ~cada ${Math.max(1, Math.round(fila.promedioDias))} días`
                        : fila.totalCambios === 1
                            ? '1 cambio registrado'
                            : 'Sin cambios todavía';

                    return `
                        <tr>
                            <td><strong>${escapeHtml(fila.nombre)}</strong></td>
                            <td>${formatMoneda(fila.costoActual)} / ${escapeHtml(fila.unidad)}</td>
                            <td><span class="ds-cost-change ${variacionClase}">${variacionTexto}</span></td>
                            <td>${escapeHtml(fechaTexto)}</td>
                            <td>${escapeHtml(frecuenciaTexto)}</td>
                        </tr>
                    `;
                }).join('');
            };

            renderizarFluctuacionesCostos();

            // A. Procesar Distribución Horaria
            let horasDistribucion = Array(24).fill(0);
            ventasArray.forEach(v => {
                if(v.fecha) {
                    let hora = v.fecha.toDate().getHours();
                    horasDistribucion[hora] += (v.total || 0);
                }
            });

            let labelsHoras = [], dataHorasPlot = [];
            for(let h=9; h<=21; h++) {
                labelsHoras.push(`${h}:00 hs`);
                dataHorasPlot.push(horasDistribucion[h]);
            }

            // B. Procesar Ventas Diarias
            let ventasDiariasMap = {};
            let diasSemanaConteo = Array(7).fill(0);

            todasLasCajas.forEach(c => {
                if(c.fechaApertura) {
                    let diaCorta = formatearFechaCorta(c.fechaApertura);
                    let diaSemana = c.fechaApertura.toDate().getDay();
                    // La caja física incluye anticipos. En ventas se resta el
                    // ingreso diferido y se agrega el consumo de saldo.
                    let totalDia = (Number(c.totalEfectivo) || 0)
                        + (Number(c.totalMercadoPago) || 0)
                        - (Number(c.anticiposCC_Efectivo) || 0)
                        - (Number(c.anticiposCC_MercadoPago) || 0)
                        + (Number(c.ventasCuentaCorriente) || 0);
                    
                    ventasDiariasMap[diaCorta] = (ventasDiariasMap[diaCorta] || 0) + totalDia;
                    diasSemanaConteo[diaSemana]++;
                }
            });

            let valoresDiarios = Object.values(ventasDiariasMap);
            let labelsDiarios = Object.keys(ventasDiariasMap).slice(0, 15).reverse(); 
            let dataDiariaPlot = Object.values(ventasDiariasMap).slice(0, 15).reverse();

            // Matemática de Dispersión
            let media = 0, mediana = 0, max = 0, min = 0, rango = 0, varianza = 0, stdDev = 0;
            if(valoresDiarios.length > 0) {
                max = Math.max(...valoresDiarios);
                min = Math.min(...valoresDiarios);
                rango = max - min;
                media = valoresDiarios.reduce((a,b)=>a+b, 0) / valoresDiarios.length;
                
                let ordenados = [...valoresDiarios].sort((a,b)=>a-b);
                let mid = Math.floor(ordenados.length/2);
                mediana = ordenados.length % 2 !== 0 ? ordenados[mid] : (ordenados[mid-1]+ordenados[mid])/2;

                varianza = valoresDiarios.reduce((a,b) => a + Math.pow(b - media, 2), 0) / valoresDiarios.length;
                stdDev = Math.sqrt(varianza);
            }

            // C. Ticket Promedio
            let ticketPromedio = 0;
            let totalDineroTickets = ventasArray.reduce((acc, v) => acc + (v.total || 0), 0);
            if(ventasArray.length > 0) {
                ticketPromedio = totalDineroTickets / ventasArray.length;
            }

            // D. Productos, Finanzas Netas y Pronóstico
            let dataProductos = {};
            let rentabilidadCategoria = {};
            let totalUnidadesVendidas = 0;
            let totalPlataVendida = 0;
            let totalCostoHistoricoVentas = 0;
            let unidadesConSnapshot = 0;
            let unidadesLegacy = 0;
            
            let acumuladoDiasRetencion = 0;
            let qtyTicketsConLote = 0;
            let demandaPorDiaSemana = Array(7).fill(0).map(() => ({}));

            ventasArray.forEach(v => {
                let dSemana = v.fecha ? v.fecha.toDate().getDay() : null;

                (v.items || []).forEach(item => {
                    let qty = parseInt(item.cantidad) || 0;
                    let bruto = qty * (parseFloat(item.precio) || 0);
                    
                    totalUnidadesVendidas += qty;
                    totalPlataVendida += bruto;

                    if (!dataProductos[item.nombre]) {
                        dataProductos[item.nombre] = {
                            qty: 0,
                            bruto: 0,
                            costoTotalMatPrima: 0,
                            snapshotQty: 0,
                            legacyQty: 0
                        };
                    }
                    dataProductos[item.nombre].qty += qty;
                    dataProductos[item.nombre].bruto += bruto;

                    const infoReceta = recetasMap.get(item.nombre);
                    const costoSnapshot = Number(item.costoUnitarioVenta);
                    const tieneSnapshot =
                        Number(item.costoSnapshotVersion) >= 1
                        && Number.isFinite(costoSnapshot)
                        && costoSnapshot >= 0;
                    const costoUnitarioAplicado = tieneSnapshot
                        ? costoSnapshot
                        : Number(infoReceta?.costoUnitario) || 0;
                    const costoTotalItem = tieneSnapshot && Number.isFinite(Number(item.costoTotalVenta))
                        ? Number(item.costoTotalVenta)
                        : costoUnitarioAplicado * qty;

                    dataProductos[item.nombre].costoTotalMatPrima += costoTotalItem;
                    totalCostoHistoricoVentas += costoTotalItem;

                    if (tieneSnapshot) {
                        dataProductos[item.nombre].snapshotQty += qty;
                        unidadesConSnapshot += qty;
                    } else {
                        dataProductos[item.nombre].legacyQty += qty;
                        unidadesLegacy += qty;
                    }

                    if (infoReceta) {
                        rentabilidadCategoria[infoReceta.categoria] = (rentabilidadCategoria[infoReceta.categoria] || 0) + bruto;
                    } else {
                        rentabilidadCategoria['Otros'] = (rentabilidadCategoria['Otros'] || 0) + bruto;
                    }

                    if (dSemana !== null) {
                        demandaPorDiaSemana[dSemana][item.nombre] = (demandaPorDiaSemana[dSemana][item.nombre] || 0) + qty;
                    }
                });

                if (v.fecha && v.loteFechaElaboracion) {
                    let fVenta = v.fecha.toDate();
                    let fElab = new Date(v.loteFechaElaboracion); 
                    if (!isNaN(fElab.getTime())) {
                        let diferenciaTiempo = fVenta.getTime() - fElab.getTime();
                        let diasRetencion = diferenciaTiempo / (1000 * 60 * 60 * 24);
                        if (diasRetencion >= 0 && diasRetencion < 15) { 
                            acumuladoDiasRetencion += diasRetencion;
                            qtyTicketsConLote++;
                        }
                    }
                }
            });

            // RENDER TABLA MARGEN NETO POR PRODUCTO
            const tbodyMargen = document.querySelector('#tabla-margen-productos tbody');
            if (tbodyMargen) {
                tbodyMargen.innerHTML = '';
                let sortedByPlataABC = Object.entries(dataProductos).sort((a,b) => b[1].bruto - a[1].bruto);

                sortedByPlataABC.forEach(([nombre, p]) => {
                    let util = p.bruto - p.costoTotalMatPrima;
                    let porcMargen = p.bruto > 0 ? (util / p.bruto) * 100 : 0;
                    const baseCostoHtml = p.legacyQty > 0
                        ? `<small class="ds-margin-estimated">${p.legacyQty} u. anteriores estimadas</small>`
                        : '<small class="ds-margin-snapshot">Costo congelado en cada venta</small>';

                    tbodyMargen.innerHTML += `
                        <tr>
                            <td><strong>${escapeHtml(nombre)}</strong>${baseCostoHtml}</td>
                            <td>${p.qty} u.</td>
                            <td>${formatMoneda(p.bruto)}</td>
                            <td style="color:#64748b;">${formatMoneda(p.costoTotalMatPrima)}</td>
                            <td style="color:#15803d; font-weight:bold;">${formatMoneda(util)}</td>
                            <td><span style="background:#dcfce3; color:#15803d; padding:2px 6px; border-radius:4px; font-weight:bold;">${porcMargen.toFixed(1)}%</span></td>
                        </tr>
                    `;
                });
            }

            // RENDER TABLA PRODUCCIÓN ÓPTIMA
            const tbodyOptima = document.querySelector('#tabla-produccion-optima tbody');
            if (tbodyOptima) {
                tbodyOptima.innerHTML = '';
                let mananaSemanaIndex = (new Date().getDay() + 1) % 7; 
                const diasNombres = ["Domingos", "Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábados"];
                
                const txtDia = document.getElementById('txt-dia-semana');
                if(txtDia) txtDia.textContent = `Pronóstico predictivo optimizado para mañana (${diasNombres[mananaSemanaIndex]}):`;

                let demandaMananaHistorial = demandaPorDiaSemana[mananaSemanaIndex];
                let divisorDia = diasSemanaConteo[mananaSemanaIndex] || 1;

                let arrSugeridos = Object.entries(demandaMananaHistorial || {}).sort((a,b) => b[1] - a[1]);
                if (arrSugeridos.length > 0) {
                    arrSugeridos.slice(0, 5).forEach(([nombre, qtyAcumulada]) => {
                        let promedioVendidoEseDia = qtyAcumulada / divisorDia;
                        let sugerenciaOptima = Math.ceil(promedioVendidoEseDia * 1.15);
                        tbodyOptima.innerHTML += `
                            <tr>
                                <td><strong>${escapeHtml(nombre)}</strong></td>
                                <td>${promedioVendidoEseDia.toFixed(1)} unidades</td>
                                <td><span style="background:#fef08a; color:#854d0e; padding:4px 10px; border-radius:6px; font-weight:900; border:1px dashed #ca8a04;">Preparar ${sugerenciaOptima} unidades</span></td>
                            </tr>
                        `;
                    });
                } else {
                    tbodyOptima.innerHTML = `<tr><td colspan="3" style="text-align:center; color:#94a3b8;">Faltan registros históricos para este día de la semana.</td></tr>`;
                }
            }

            // TOP PRODUCTOS (MODA)
            let sortedByQty = Object.entries(dataProductos).sort((a,b)=>b[1].qty-a[1].qty);
            const ulTop = document.getElementById('lista-top-productos');
            const ulResto = document.getElementById('lista-resto-productos');
            const btnVerMas = document.getElementById('btn-ver-mas-productos');
            
            if (ulTop && ulResto && btnVerMas) {
                ulTop.innerHTML = '';
                ulResto.innerHTML = '';
                ulResto.style.display = 'none';

                if(sortedByQty.length > 0) {
                    sortedByQty.slice(0, 5).forEach((p, idx) => {
                        let participacion = ((p[1].qty / totalUnidadesVendidas) * 100).toFixed(1);
                        ulTop.innerHTML += `<li><span><strong>#${idx+1}</strong> ${escapeHtml(p[0])}</span> <span style="color:#ec4899; font-weight:bold;">${p[1].qty} u. <small>(${participacion}%)</small></span></li>`;
                    });
                    
                    if(sortedByQty.length > 5) {
                        sortedByQty.slice(5).forEach((p, idx) => {
                            let participacion = ((p[1].qty / totalUnidadesVendidas) * 100).toFixed(1);
                            ulResto.innerHTML += `<li><span>#${idx+6} ${escapeHtml(p[0])}</span> <span style="color:#ec4899; font-weight:bold;">${p[1].qty} u. <small>(${participacion}%)</small></span></li>`;
                        });
                        btnVerMas.style.display = 'block';
                        btnVerMas.onclick = () => {
                            if(ulResto.style.display === 'none') {
                                ulResto.style.display = 'block';
                                btnVerMas.innerHTML = 'Ocultar detalle ⬆';
                            } else {
                                ulResto.style.display = 'none';
                                btnVerMas.innerHTML = 'Ver detalle completo ⬇';
                            }
                        };
                    } else {
                        btnVerMas.style.display = 'none';
                    }
                } else {
                    ulTop.innerHTML = '<li>Sin registros de ventas.</li>';
                }
            }

            // Clasificación ABC
            let sortedByPlata = Object.entries(dataProductos).sort((a,b)=>b[1].bruto-a[1].bruto);
            let sumPlata = 0;
            let listA = [], listB = [], listC = [];

            sortedByPlata.forEach(p => {
                sumPlata += p[1].bruto;
                let porcentajeAcumulado = sumPlata / totalPlataVendida;
                
                if(porcentajeAcumulado <= 0.80) {
                    listA.push(p[0]);
                } else if(porcentajeAcumulado <= 0.95) {
                    listB.push(p[0]);
                } else {
                    listC.push(p[0]);
                }
            });

            if (document.getElementById('abc-a-text')) {
                document.getElementById('abc-a-text').textContent = listA.slice(0,4).join(', ') + (listA.length > 4 ? '...' : ' (Foco Alto)');
                document.getElementById('abc-b-text').textContent = listB.slice(0,4).join(', ') + (listB.length > 4 ? '...' : ' (Foco Medio)');
                document.getElementById('abc-c-text').textContent = listC.slice(0,4).join(', ') + (listC.length > 4 ? '...' : ' (Saldos)');
            }

            // Crecimiento
            let crecClientesText = "Faltan datos";
            let crecIngresosText = "Faltan datos";

            if (ventasArray.length > 10) {
                let mitad = Math.floor(ventasArray.length / 2);
                let primeraMitad = ventasArray.slice(0, mitad);
                let segundaMitad = ventasArray.slice(mitad);

                let clientesA = primeraMitad.length;
                let clientesB = segundaMitad.length;
                let varClientes = ((clientesB - clientesA) / clientesA) * 100;
                crecClientesText = (varClientes > 0 ? '📈 +' : '📉 ') + varClientes.toFixed(1) + "%";
                if(document.getElementById('stat-crecimiento-clientes')) document.getElementById('stat-crecimiento-clientes').style.color = varClientes > 0 ? '#15803d' : '#b91c1c';

                let ingresosA = primeraMitad.reduce((acc,b)=>acc+(b.total||0), 0);
                let ingresosB = segundaMitad.reduce((acc,b)=>acc+(b.total||0), 0);
                
                let varIngresos = ingresosA > 0 ? (((ingresosB - ingresosA) / ingresosA) * 100) : 0;
                
                crecIngresosText = (varIngresos > 0 ? '📈 +' : '📉 ') + varIngresos.toFixed(1) + "%";
                if(document.getElementById('stat-crecimiento-ingresos')) document.getElementById('stat-crecimiento-ingresos').style.color = varIngresos > 0 ? '#15803d' : '#b91c1c';
            }

            let mejorLinea = "-";
            let maxLineaPlata = 0;
            for(let cat in rentabilidadCategoria) {
                if(rentabilidadCategoria[cat] > maxLineaPlata) {
                    maxLineaPlata = rentabilidadCategoria[cat];
                    mejorLinea = cat;
                }
            }

            let totalDesperdicioQty = 0;
            auditArray.forEach(a => {
                if(a.tipo === 'RESTA' && a.motivo && a.motivo.toLowerCase().includes('descarte')) {
                    totalDesperdicioQty += parseInt(a.cantidad) || 0;
                }
            });
            let porcentajeDesperdicio = 0;
            if((totalUnidadesVendidas + totalDesperdicioQty) > 0) {
                porcentajeDesperdicio = (totalDesperdicioQty / (totalUnidadesVendidas + totalDesperdicioQty)) * 100;
            }

            let vidaUtilPromedio = qtyTicketsConLote > 0 ? (acumuladoDiasRetencion / qtyTicketsConLote) : 0;
            let indiceRotacion = totalUnidadesVendidas > 0 ? (totalUnidadesVendidas / (valoresDiarios.length || 1)).toFixed(1) + " piezas/día" : "Baja";

            // Actualizar DOM
            if(document.getElementById('stat-media')) document.getElementById('stat-media').textContent = formatMoneda(media);
            if(document.getElementById('stat-mediana')) document.getElementById('stat-mediana').textContent = formatMoneda(mediana);
            if(document.getElementById('stat-ticket-promedio')) document.getElementById('stat-ticket-promedio').textContent = formatMoneda(ticketPromedio);
            if(document.getElementById('stat-vida-util')) document.getElementById('stat-vida-util').textContent = vidaUtilPromedio > 0 ? `${vidaUtilPromedio.toFixed(1)} días` : "S/Datos PEPS";
            if(document.getElementById('stat-desperdicio')) document.getElementById('stat-desperdicio').textContent = porcentajeDesperdicio.toFixed(1) + '%';
            
            if(document.getElementById('stat-max')) document.getElementById('stat-max').textContent = formatMoneda(max);
            if(document.getElementById('stat-min')) document.getElementById('stat-min').textContent = formatMoneda(min);
            if(document.getElementById('stat-rango')) document.getElementById('stat-rango').textContent = formatMoneda(rango);
            if(document.getElementById('stat-varianza')) document.getElementById('stat-varianza').textContent = Math.round(varianza).toLocaleString('es-AR');
            if(document.getElementById('stat-stddev')) document.getElementById('stat-stddev').textContent = formatMoneda(stdDev);

            const promedioMargenGlobal = totalPlataVendida > 0
                ? (((totalPlataVendida - totalCostoHistoricoVentas) / totalPlataVendida) * 100).toFixed(1) + "%"
                : "Sin Datos";
            if(document.getElementById('stat-crecimiento-clientes')) document.getElementById('stat-crecimiento-clientes').textContent = crecClientesText;
            if(document.getElementById('stat-crecimiento-ingresos')) document.getElementById('stat-crecimiento-ingresos').textContent = crecIngresosText;
            if(document.getElementById('stat-rotacion-inventario')) document.getElementById('stat-rotacion-inventario').textContent = indiceRotacion;
            if(document.getElementById('stat-margen-promedio')) {
                const margenEl = document.getElementById('stat-margen-promedio');
                margenEl.textContent = promedioMargenGlobal + (unidadesLegacy > 0 ? ' *' : '');
                margenEl.title = unidadesLegacy > 0
                    ? `Incluye ${unidadesLegacy} unidades de ventas anteriores a esta actualización, estimadas con el costo disponible actualmente. ${unidadesConSnapshot} unidades ya tienen costo histórico congelado.`
                    : 'Calculado con el costo congelado en el momento de cada venta.';
            }
            if(document.getElementById('stat-linea-rentable')) document.getElementById('stat-linea-rentable').textContent = mejorLinea;

            // Render Gráfico Lineal 
            const elLine = document.getElementById('chartLineVentas');
            if (elLine) {
                const ctxLine = elLine.getContext('2d');
                if(chartVentasInstancia) chartVentasInstancia.destroy();
                chartVentasInstancia = new Chart(ctxLine, {
                    type: 'line',
                    data: {
                        labels: labelsDiarios,
                        datasets: [{
                            label: 'Facturación ($)',
                            data: dataDiariaPlot,
                            borderColor: '#ec4899',
                            backgroundColor: 'rgba(236, 72, 153, 0.2)',
                            fill: true,
                            tension: 0.4
                        }]
                    }
                });
            }

            // Render Gráfico de Barras 
            const elBar = document.getElementById('chartBarHoras');
            if (elBar) {
                const ctxBar = elBar.getContext('2d');
                if(chartBarHorasInstancia) chartBarHorasInstancia.destroy();
                chartBarHorasInstancia = new Chart(ctxBar, {
                    type: 'bar',
                    data: {
                        labels: labelsHoras,
                        datasets: [{
                            label: 'Ventas Acumuladas ($)',
                            data: dataHorasPlot,
                            backgroundColor: '#0ea5e9',
                            borderRadius: 6
                        }]
                    },
                    options: {
                        plugins: { legend: { display: false } }
                    }
                });
            }

            if (statsLoading) statsLoading.style.display = 'none';
            if (statsContent) statsContent.style.display = 'block';

        } catch(error) {
            console.error("Error calculando KPIs:", error);
            if (statsLoading) statsLoading.innerHTML = '<p style="color:red;">Error de conexión procesando los datos.</p>';
        }
    }
}
