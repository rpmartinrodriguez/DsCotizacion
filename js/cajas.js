import { 
    getFirestore, collection, onSnapshot, query, orderBy, getDocs, where, updateDoc, doc 
} from "https://www.gstatic.com/firebasejs/9.15.0/firebase-firestore.js";

export function setupCajas(app) {
    const db = getFirestore(app);
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
    const sectionHistorial = document.getElementById('section-historial');
    const sectionEstadisticas = document.getElementById('section-estadisticas');

    const modalInfo = document.getElementById('modal-info');
    const infoTitle = document.getElementById('info-title');
    const infoDesc = document.getElementById('info-desc');
    const infoSirve = document.getElementById('info-sirve');
    const infoEj = document.getElementById('info-ej');
    const infoDec = document.getElementById('info-dec');
    const btnCerrarInfo = document.getElementById('btn-cerrar-info');

    let todasLasCajas = [];
    let statsYaCargadas = false;
    let chartVentasInstancia = null;
    let chartBarHorasInstancia = null;

    // ==========================================
    // 1. DICCIONARIO PARA LA FAMOSA (i) - COMPLETO
    // ==========================================
    const infoDiccionario = {
        "media": {
            titulo: "Media (Venta diaria promedio)",
            desc: "Es el total facturado históricamente dividido por la cantidad de días abiertos.",
            sirve: "Para saber el ingreso bruto normal de un día común en Dulce App.",
            ej: "Si abrís 10 días y sumás $200.000, tu media es de $20.000 diarios.",
            dec: "Si la media está bajando mes a mes, necesitás lanzar combos de manera urgente o abrir canales de delivery."
        },
        "mediana": {
            titulo: "Mediana (El punto central real)",
            desc: "Es el valor del día del medio si ordenamos todas tus ventas de menor a mayor.",
            sirve: "Para no dejarte engañar por un día de ventas descomunal (como Navidad) que altera los promedios.",
            ej: "Días de: $4.000, $5.000 y $60.000 (Día de la Madre). Tu promedio da $23.000 (irreal), pero tu mediana da $5.000 (tu día a día real).",
            dec: "Si la mediana está muy lejos del promedio, dependés de picos de suerte. Necesitás promociones para estabilizar los días hábiles."
        },
        "ticket_promedio": {
            titulo: "Ticket Promedio (Gasto por Cliente)",
            desc: "Calcula cuánta plata te deja, en promedio, cada cliente en el mostrador (Ventas Totales / Cantidad de transacciones).",
            sirve: "Mide el poder de compra de tus clientes y la efectividad del vendedor en sugerir agregados.",
            ej: "Si hacés 3 ventas y sumás $6.000, tu ticket promedio es de $2.000 por persona.",
            dec: "Si es bajo, capacita al personal para ofrecer agregados ('¿Te sumó unos macarons o velitas por $500?'). Sube el ticket al instante."
        },
        "desperdicio": {
            titulo: "Nivel de Desperdicio Real",
            desc: "Porcentaje de porciones o unidades dadas de baja por motivo 'Descarte/Vencimiento' sobre la producción total.",
            sirve: "Detectar pérdidas de dinero silenciosas en la heladera de exhibición.",
            ej: "Producís 50 porciones de Lemon Pie, vendés 45 y descartás 5 por vencimiento. Tu desperdicio es del 10%.",
            dec: "Si supera el 5%, estás perdiendo plata. Ajustá tus recetas, hacé tandas más chicas o usá el sistema de Lotes (PEPS) para vender lo más viejo primero."
        },
        "moda": {
            titulo: "Productos Estrella (Moda)",
            desc: "Muestra la lista de los productos más seleccionados y repetidos en los carritos de compra.",
            sirve: "Para saber qué es lo que la gente más busca en Dulce App.",
            ej: "El Rogel y los Alfajores lideran el ranking con más unidades despachadas.",
            dec: "Nunca permitas que falte stock de estos 5 productos. Úsalos como imán en tus redes sociales."
        },
        "ventas_diarias": {
            titulo: "Tendencia y Evolución de Ventas",
            desc: "Un gráfico lineal que conecta el total recaudado en los últimos 15 turnos comerciales.",
            sirve: "Monitorear visualmente si la facturación va hacia arriba o hacia abajo en el corto plazo.",
            ej: "Permite ver saltos ascendentes marcados los fines de semana.",
            dec: "Si la curva se mantiene plana o cae en los días de semana, poné el foco en promociones atractivas de meriendas los martes y miércoles."
        },
        "horas_pico": {
            titulo: "Horas Pico de Consumo",
            desc: "Analiza la hora exacta en la que se confirmaron los tickets de venta en el mostrador.",
            sirve: "Para saber en qué momento exacto del día se junta la mayor cantidad de clientes en el local.",
            ej: "El gráfico mostrará barras altas concentradas entre las 16:30 y las 19:00 horas.",
            dec: "Usa este dato para programar los horarios de descanso del personal y asegurar que la vitrina esté llena de productos justo antes del estallido."
        },
        "abc": {
            titulo: "Clasificación ABC (Pareto 80/20)",
            desc: "Divide tus productos por importancia de ingresos: Clase A (Te dan el 80% del dinero), Clase B (15%), Clase C (Solo el 5%).",
            sirve: "Saber exactamente dónde poner tu energía, tus compras de stock y tus cuidados.",
            ej: "Tus tortas premium son Clase A (poca variedad, mucha plata). Las velitas y cajas de regalo son Clase C.",
            dec: "Productos A: Hacé inventario riguroso y cuidá su calidad. Productos C: Comprá en cantidad para stockearte y olvidate por meses."
        },
        "estrategicos": {
            titulo: "Métricas Estratégicas y Rotación",
            desc: "Monitorea la velocidad con la que se vacía el mostrador, el margen global de recetas y la tasa de crecimiento.",
            sirve: "Garantizar la salud del negocio a largo plazo y verificar que el mostrador se mueva rápido.",
            ej: "Una rotación de stock alta significa mercadería súper fresca que pasa pocas horas en exhibición.",
            dec: "Si el margen promedio de recetas cae, significa que los proveedores te aumentaron y vos no tocaste los precios del mostrador. ¡Hora de remarcar!"
        },
        "dispersion": {
            titulo: "Medidas de Dispersión",
            desc: "Miden qué tan caóticas o estables son tus ventas usando Varianza y Desviación Estándar.",
            sirve: "Para saber qué tan predecible es tu negocio de cara al futuro.",
            ej: "Un local estable vende $10.000 siempre. Uno inestable vende $2.000 un lunes y $35.000 un sábado.",
            dec: "Si la desviación estándar es muy alta, tu caja es volátil. Mantené un colchón de fondo inicial más grande para amortiguar los días bajos."
        }
    };

    // Escuchador global de clics para la info (i)
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

    // ==========================================
    // 2. GESTIÓN DE PESTAÑAS (TABS)
    // ==========================================
    if (tabBtnHistorial && tabBtnEstadisticas) {
        tabBtnHistorial.addEventListener('click', () => {
            tabBtnHistorial.classList.add('active');
            tabBtnEstadisticas.classList.remove('active');
            if (sectionHistorial) sectionHistorial.style.display = 'block';
            if (sectionEstadisticas) sectionEstadisticas.style.display = 'none';
        });

        tabBtnEstadisticas.addEventListener('click', () => {
            tabBtnEstadisticas.classList.add('active');
            tabBtnHistorial.classList.remove('active');
            if (sectionHistorial) sectionHistorial.style.display = 'none';
            if (sectionEstadisticas) sectionEstadisticas.style.display = 'block';

            if(!statsYaCargadas) {
                generarDashboard();
                statsYaCargadas = true;
            }
        });
    }

    const btnCargarStats = document.getElementById('btn-cargar-stats');
    if (btnCargarStats) {
        btnCargarStats.addEventListener('click', generarDashboard);
    }

    // Helpers de Formato
    function formatMoneda(val) {
        return `$${(val || 0).toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    }
    function formatearFecha(timestamp) {
        if (!timestamp) return 'Fecha desconocida';
        const date = timestamp.toDate();
        return date.toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute:'2-digit' });
    }
    function formatearFechaCorta(timestamp) {
        if (!timestamp) return '';
        const date = timestamp.toDate();
        return date.toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit' });
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
        todasLasCajas = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        actualizarFiltros();
        renderizarCajas();
    });

    filtroMesSelect.addEventListener('change', renderizarCajas);

    async function cargarTicketsDeCaja(cajaId, container) {
        try {
            const q = query(ventasCollection, where('cajaId', '==', cajaId));
            const querySnapshot = await getDocs(q);
            
            if (querySnapshot.empty) {
                container.innerHTML = '<p class="text-light" style="font-size: 0.9rem;">No hubo ventas en este turno.</p>';
                return;
            }

            let ventas = [];
            querySnapshot.forEach(docSnap => ventas.push(docSnap.data()));
            ventas.sort((a, b) => (b.fecha?.seconds || 0) - (a.fecha?.seconds || 0));

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
                await updateDoc(doc(db, 'cajas', cajaId), { facturadoMP: !estadoActual });
            } catch (err) {
                console.error(err);
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

    if (btnCalcularFacturacion) {
        btnCalcularFacturacion.addEventListener('click', () => {
            const desdeStr = calcDesde.value;
            const hastaStr = calcHasta.value;
            if (!desdeStr || !hastaStr) return;

            const dInicio = new Date(`${desdeStr}T00:00:00`);
            const dFin = new Date(`${hastaStr}T23:59:59`);
            let totalMP = 0, factMP = 0;

            todasLasCajas.forEach(caja => {
                if (caja.fechaApertura) {
                    const dCaja = caja.fechaApertura.toDate();
                    if (dCaja >= dInicio && dCaja <= dFin) {
                        totalMP += (caja.totalMercadoPago || 0);
                        if (caja.facturadoMP === true) factMP += (caja.totalMercadoPago || 0);
                    }
                }
            });

            resTotalMp.textContent = formatMoneda(totalMP);
            resFacturadoMp.textContent = formatMoneda(factMP);
            resPendienteMp.textContent = formatMoneda(totalMP - factMP);
            resultadoFacturacion.style.display = 'block';
        });
    }

    // ==========================================
    // 5. MATEMÁTICA Y DASHBOARD ESTADÍSTICO
    // ==========================================
    async function generarDashboard() {
        document.getElementById('stats-loading').style.display = 'block';
        document.getElementById('stats-content').style.display = 'none';

        try {
            const [ventasSnap, auditSnap, recetasSnap] = await Promise.all([
                getDocs(collection(db, 'ventasMostrador')),
                getDocs(collection(db, 'auditoriaMostrador')),
                getDocs(collection(db, 'recetas'))
            ]);

            let ventasArray = [];
            ventasSnap.forEach(v => ventasArray.push(v.data()));
            ventasArray.sort((a,b) => (a.fecha?.seconds || 0) - (b.fecha?.seconds || 0));

            let auditArray = [];
            auditSnap.forEach(a => auditArray.push(a.data()));

            let recetasMap = new Map();
            let sumatoriaMargenes = 0, qtyMargenes = 0;
            recetasSnap.forEach(r => {
                let rd = r.data();
                recetasMap.set(rd.nombreTorta, { categoria: rd.categoria || 'Otros', margen: parseFloat(rd.margenIndividual) || null });
                if(rd.margenIndividual) {
                    sumatoriaMargenes += parseFloat(rd.margenIndividual);
                    qtyMargenes++;
                }
            });

            // A. Distribución Horaria (Horas Pico)
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

            // B. Ventas Diarias
            let ventasDiariasMap = {};
            todasLasCajas.forEach(c => {
                if(c.fechaApertura) {
                    let dia = formatearFechaCorta(c.fechaApertura);
                    ventasDiariasMap[dia] = (ventasDiariasMap[dia] || 0) + (c.totalEfectivo || 0) + (c.totalMercadoPago || 0);
                }
            });

            let valoresDiarios = Object.values(ventasDiariasMap);
            let labelsDiarios = Object.keys(ventasDiariasMap).slice(0, 15).reverse(); 
            let dataDiariaPlot = Object.values(ventasDiariasMap).slice(0, 15).reverse();

            // Despersión Estadística
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

            // C. Ticket Promedio Exacto
            let ticketPromedio = 0;
            let totalDineroTickets = ventasArray.reduce((acc, v) => acc + (v.total || 0), 0);
            if(ventasArray.length > 0) {
                ticketPromedio = totalDineroTickets / ventasArray.length;
            }

            // D. Productos y Pareto ABC
            let conteoProductosQty = {}, conteoProductosPlata = {}, rentabilidadCategoria = {}, totalUnidadesVendidas = 0, totalPlataVendida = 0;

            ventasArray.forEach(v => {
                (v.items || []).forEach(item => {
                    let qty = parseInt(item.cantidad) || 0;
                    let monto = qty * (parseFloat(item.precio) || 0);
                    totalUnidadesVendidas += qty;
                    totalPlataVendida += monto;

                    conteoProductosQty[item.nombre] = (conteoProductosQty[item.nombre] || 0) + qty;
                    conteoProductosPlata[item.nombre] = (conteoProductosPlata[item.nombre] || 0) + monto;
                    
                    let cat = (recetasMap.get(item.nombre) || {categoria: 'Otros'}).categoria;
                    rentabilidadCategoria[cat] = (rentabilidadCategoria[cat] || 0) + monto;
                });
            });

            // TOP PRODUCTOS
            let sortedByQty = Object.entries(conteoProductosQty).sort((a,b)=>b[1]-a[1]);
            ulTop.innerHTML = ''; ulResto.innerHTML = ''; ulResto.style.display = 'none';

            if(sortedByQty.length > 0) {
                sortedByQty.slice(0, 5).forEach((p, idx) => {
                    let part = ((p[1] / totalUnidadesVendidas) * 100).toFixed(1);
                    ulTop.innerHTML += `<li><span><strong>#${idx+1}</strong> ${p[0]}</span> <span style="color:#ec4899; font-weight:bold;">${p[1]} u. <small>(${part}%)</small></span></li>`;
                });
                if(sortedByQty.length > 5) {
                    sortedByQty.slice(5).forEach((p, idx) => {
                        let part = ((p[1] / totalUnidadesVendidas) * 100).toFixed(1);
                        ulResto.innerHTML += `<li><span>#${idx+6} ${p[0]}</span> <span style="color:#ec4899; font-weight:bold;">${p[1]} u. <small>(${part}%)</small></span></li>`;
                    });
                    btnVerMas.style.display = 'block';
                    btnVerMas.onclick = () => {
                        ulResto.style.display = ulResto.style.display === 'none' ? 'block' : 'none';
                        btnVerMas.innerHTML = ulResto.style.display === 'block' ? 'Ocultar detalle ⬆' : 'Ver detalle completo ⬇';
                    };
                } else { btnVerMas.style.display = 'none'; }
            } else { ulTop.innerHTML = '<li>Sin registros de ventas.</li>'; }

            // Pareto ABC
            let sortedByPlata = Object.entries(conteoProductosPlata).sort((a,b)=>b[1]-a[1]);
            let sumPlata = 0, listA = [], listB = [], listC = [];

            sortedByPlata.forEach(p => {
                sumPlata += p[1];
                let porcAcum = sumPlata / totalPlataVendida;
                if(porcAcum <= 0.80) listA.push(p[0]);
                else if(porcAcum <= 0.95) listB.push(p[0]);
                else listC.push(p[0]);
            });

            document.getElementById('abc-a-text').textContent = listA.slice(0,4).join(', ') + (listA.length > 4 ? '...' : ' (Foco Alto)');
            document.getElementById('abc-b-text').textContent = listB.slice(0,4).join(', ') + (listB.length > 4 ? '...' : ' (Foco Medio)');
            document.getElementById('abc-c-text').textContent = listC.slice(0,4).join(', ') + (listC.length > 4 ? '...' : ' (Saldos)');

            // E. Crecimientos e Indicadores
            let crecClientesText = "Faltan datos", crecIngresosText = "Faltan datos";
            if (ventasArray.length > 10) {
                let mit = Math.floor(ventasArray.length / 2);
                let vA = ventasArray.slice(0, mit), vB = ventasArray.slice(mit);
                let varCli = ((vB.length - vA.length) / vA.length) * 100;
                let ingA = vA.reduce((a,b)=>a+(b.total||0),0), ingB = vB.reduce((a,b)=>a+(b.total||0),0);
                let varIng = ((ingB - ingA) / ingA) * 100;

                crecClientesText = (varCli > 0 ? '📈 +' : '📉 ') + varCli.toFixed(1) + "%";
                document.getElementById('stat-crecimiento-clientes').style.color = varCli > 0 ? '#15803d' : '#b91c1c';
                crecIngresosText = (varIng > 0 ? '📈 +' : '📉 ') + varIng.toFixed(1) + "%";
                document.getElementById('stat-crecimiento-ingresos').style.color = varIng > 0 ? '#15803d' : '#b91c1c';
            }

            let mejorLinea = "-"; let maxLineaPlata = 0;
            for(let cat in rentabilidadCategoria) {
                if(rentabilidadCategoria[cat] > maxLineaPlata) { maxLineaPlata = rentabilidadCategoria[cat]; mejorLinea = cat; }
            }

            // F. Desperdicios y Rotación
            let totalDesperdicioQty = 0;
            auditArray.forEach(a => {
                if(a.tipo === 'RESTA' && a.motivo && a.motivo.toLowerCase().includes('descarte')) totalDesperdicioQty += parseInt(a.cantidad) || 0;
            });
            let porcDesperdicio = totalUnidadesVendidas > 0 ? (totalDesperdicioQty / (totalUnidadesVendidas + totalDesperdicioQty)) * 100 : 0;
            let indiceRotacion = totalUnidadesVendidas > 0 ? (totalUnidadesVendidas / (valoresDiarios.length || 1)).toFixed(1) + " piezas/día" : "Baja";

            // Actualización Visual DOM
            document.getElementById('stat-media').textContent = formatMoneda(media);
            document.getElementById('stat-mediana').textContent = formatMoneda(mediana);
            document.getElementById('stat-ticket-promedio').textContent = formatMoneda(ticketPromedio);
            document.getElementById('stat-desperdicio').textContent = porcDesperdicio.toFixed(1) + '%';
            
            document.getElementById('stat-max').textContent = formatMoneda(max);
            document.getElementById('stat-min').textContent = formatMoneda(min);
            document.getElementById('stat-rango').textContent = formatMoneda(rango);
            document.getElementById('stat-varianza').textContent = Math.round(varianza).toLocaleString('es-AR');
            document.getElementById('stat-stddev').textContent = formatMoneda(stdDev);

            document.getElementById('stat-crecimiento-clientes').textContent = crecClientesText;
            document.getElementById('stat-crecimiento-ingresos').textContent = crecIngresosText;
            document.getElementById('stat-rotacion-inventario').textContent = indiceRotacion;
            document.getElementById('stat-margen-promedio').textContent = qtyMargenes > 0 ? (sumatoriaMargenes/qtyMargenes).toFixed(1) + "%" : "Sin datos";
            
            if (document.getElementById('stat-lineable-rentable')) {
                document.getElementById('stat-lineable-rentable').textContent = mejorLinea;
            } else if (document.getElementById('stat-linea-rentable')) {
                document.getElementById('stat-linea-rentable').textContent = mejorLinea;
            }

            // Render Gráfico Lineal (Evolución)
            const ctxLine = document.getElementById('chartLineVentas').getContext('2d');
            if(chartVentasInstancia) chartVentasInstancia.destroy();
            chartVentasInstancia = new Chart(ctxLine, {
                type: 'line',
                data: {
                    labels: labelsDiarios,
                    datasets: [{
                        label: 'Turno Comercial ($)',
                        data: dataDiariaPlot,
                        borderColor: '#ec4899',
                        backgroundColor: 'rgba(236, 72, 153, 0.15)',
                        fill: true,
                        tension: 0.35
                    }]
                }
            });

            // Render Gráfico de Barras (Horas Pico) - PROTEGIDO
            const elBar = document.getElementById('chartBarHoras');
            if (elBar) {
                const ctxBar = elBar.getContext('2d');
                if(chartBarHorasInstancia) chartBarHorasInstancia.destroy();
                chartBarHorasInstancia = new Chart(ctxBar, {
                    type: 'bar',
                    data: {
                        labels: labelsHoras,
                        datasets: [{
                            label: 'Acumulado Facturado ($)',
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

            document.getElementById('stats-loading').style.display = 'none';
            document.getElementById('stats-content').style.display = 'block';

        } catch(error) {
            console.error("Error al compilar el dashboard de BI:", error);
            document.getElementById('stats-loading').innerHTML = '<p style="color:red;">Error cargando indicadores complejos.</p>';
        }
    }
}
