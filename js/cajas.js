import { 
    getFirestore, collection, onSnapshot, query, orderBy, getDocs, where, updateDoc, doc 
} from "https://www.gstatic.com/firebasejs/9.15.0/firebase-firestore.js";

export function setupCajas(app) {
    const db = getFirestore(app);
    const cajasCollection = collection(db, 'cajas');
    const ventasCollection = collection(db, 'ventasMostrador');

    const listaCajasContainer = document.getElementById('lista-cajas-container');
    const filtroMesSelect = document.getElementById('filtro-mes-cajas');
    
    // Elementos de la Calculadora de Facturación
    const btnCalcularFacturacion = document.getElementById('btn-calcular-facturacion');
    const calcDesde = document.getElementById('calc-desde');
    const calcHasta = document.getElementById('calc-hasta');
    const resultadoFacturacion = document.getElementById('resultado-facturacion');
    const resTotalMp = document.getElementById('res-total-mp');
    const resFacturadoMp = document.getElementById('res-facturado-mp');
    const resPendienteMp = document.getElementById('res-pendiente-mp');

    let todasLasCajas = [];

    // Funciones Helper
    function formatMoneda(val) {
        return `$${(val || 0).toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    }
    
    function formatearFecha(timestamp) {
        if (!timestamp) return 'Fecha desconocida';
        const date = timestamp.toDate();
        return date.toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute:'2-digit' });
    }

    function formatearMesAnio(timestamp) {
        if (!timestamp) return null;
        const date = timestamp.toDate();
        const mes = (date.getMonth() + 1).toString().padStart(2, '0');
        const anio = date.getFullYear();
        return `${anio}-${mes}`; 
    }

    function nombreMes(mesAnio) {
        const [anio, mes] = mesAnio.split('-');
        const fecha = new Date(anio, parseInt(mes) - 1, 1);
        const nombre = fecha.toLocaleDateString('es-AR', { month: 'long' });
        return nombre.charAt(0).toUpperCase() + nombre.slice(1) + ' ' + anio;
    }

    // ==========================================
    // 1. RENDERIZAR LA LISTA DE CAJAS
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

            // Datos del tilde Facturado
            const isFacturado = caja.facturadoMP === true;
            const btnFacturadoClass = isFacturado ? 'facturado-true' : 'facturado-false';
            const btnFacturadoText = isFacturado ? '✅ Facturado' : '❌ Marcar Facturado';

            const div = document.createElement('div');
            div.className = 'categoria-acordeon'; 
            div.style.marginBottom = '1.5rem';

            div.innerHTML = `
                <div class="categoria-acordeon__header caja-header" data-id="${caja.id}">
                    <div>
                        <div style="font-size: 1.1rem;">Apertura: ${formatearFecha(caja.fechaApertura)}</div>
                        <div style="font-size: 0.85rem; color: var(--text-light); font-weight: normal; margin-top: 0.2rem;">
                            👤 ${caja.usuarioNombre || 'Usuario'}
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
                                <span>Fondo Inicial</span>
                                <span>${formatMoneda(fondo)}</span>
                            </div>
                            <div class="caja-resumen-item">
                                <span>Ventas Efvo. (Neto)</span>
                                <span style="color: var(--success-color);">${formatMoneda(efvo)}</span>
                            </div>
                            <div class="caja-resumen-item">
                                <span>Ventas MP (Neta)</span>
                                <div>
                                    <span style="color: var(--success-color); display: block; margin-bottom: 0.3rem;">${formatMoneda(mp)}</span>
                                    <button class="btn-facturado ${btnFacturadoClass}" data-id="${caja.id}" data-estado="${isFacturado}" style="padding: 0.2rem 0.5rem; font-size: 0.75rem; border-radius: 4px; cursor:pointer;">
                                        ${btnFacturadoText}
                                    </button>
                                </div>
                            </div>
                            <div class="caja-resumen-item" style="border-left: 2px solid var(--border-color); padding-left: 1rem;">
                                <span>Efectivo en Caja</span>
                                <span style="color: var(--primary-color);">${formatMoneda(cajaFisica)}</span>
                            </div>
                        </div>

                        <div class="ticket-list">
                            <h3 style="font-size: 1rem; margin-top: 0; margin-bottom: 1rem;">Detalle de Ventas</h3>
                            <div id="tickets-${caja.id}">
                                <p class="text-light" style="font-size: 0.9rem;">Cargando tickets...</p>
                            </div>
                        </div>
                    </div>
                </div>
            `;
            listaCajasContainer.appendChild(div);
        });
    }

    // ==========================================
    // 2. ACTUALIZAR FILTROS DE MESES
    // ==========================================
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

    // ==========================================
    // 3. CARGAR CAJAS AL INICIAR
    // ==========================================
    onSnapshot(query(cajasCollection, orderBy('fechaApertura', 'desc')), (snapshot) => {
        todasLasCajas = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        actualizarFiltros();
        renderizarCajas();
    });

    filtroMesSelect.addEventListener('change', renderizarCajas);

    // ==========================================
    // 4. INTERACCIÓN (ACORDEÓN Y TICKETS FIREBASE FIX)
    // ==========================================
    async function cargarTicketsDeCaja(cajaId, container) {
        try {
            // FIX FIREBASE: Consulta limpia sin orderBy para evitar el error de índice.
            const q = query(ventasCollection, where('cajaId', '==', cajaId));
            const querySnapshot = await getDocs(q);
            
            if (querySnapshot.empty) {
                container.innerHTML = '<p class="text-light" style="font-size: 0.9rem;">No hubo ventas en este turno.</p>';
                return;
            }

            let ventas = [];
            querySnapshot.forEach(docSnap => ventas.push(docSnap.data()));

            // Ordenamiento manual en Javascript
            ventas.sort((a, b) => {
                if (!a.fecha || !b.fecha) return 0;
                return b.fecha.seconds - a.fecha.seconds;
            });

            container.innerHTML = '';
            ventas.forEach(venta => {
                const itemsTexto = (venta.items || [])
                    .map(item => `${item.cantidad}x ${item.nombre}`)
                    .join(', ');

                let tagMP = '';
                if (venta.metodoPago === 'Ambos') {
                    tagMP = `<span class="metodo-pago-tag">Efvo: ${formatMoneda(venta.pagoEfectivo)} | MP: ${formatMoneda(venta.pagoMercadoPago)}</span>`;
                } else {
                    tagMP = `<span class="metodo-pago-tag">${venta.metodoPago}</span>`;
                }

                const ticketDiv = document.createElement('div');
                ticketDiv.className = 'ticket-item';
                ticketDiv.innerHTML = `
                    <div class="ticket-info">
                        <h4>Hora: ${formatearFecha(venta.fecha).split(',')[1] || ''} ${tagMP}</h4>
                        <p>${itemsTexto}</p>
                    </div>
                    <div class="ticket-monto">${formatMoneda(venta.total)}</div>
                `;
                container.appendChild(ticketDiv);
            });
        } catch (error) {
            console.error("Error al cargar tickets:", error);
            container.innerHTML = '<p style="color: var(--danger-color); font-size: 0.9rem;">Error al cargar las ventas.</p>';
        }
    }

    listaCajasContainer.addEventListener('click', async (e) => {
        if (e.target.closest('.btn-facturado')) {
            const btn = e.target.closest('.btn-facturado');
            const cajaId = btn.dataset.id;
            const estadoActual = btn.dataset.estado === 'true';

            try {
                btn.textContent = "..."; 
                await updateDoc(doc(db, 'cajas', cajaId), {
                    facturadoMP: !estadoActual
                });
            } catch (err) {
                console.error("Error al cambiar estado de facturación:", err);
                alert("Hubo un error de conexión.");
            }
            return; 
        }

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
    // 5. LÓGICA DE LA CALCULADORA DE FACTURACIÓN
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
                        const mp = caja.totalMercadoPago || 0;
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

            resultadoFacturacion.style.display = 'block';
        });
    }
}
