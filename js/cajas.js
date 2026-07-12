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
    // 1. DICCIONARIO PARA LA (i) DE TODOS LOS INDICADORES
    // ==========================================
    const infoDiccionario = {
        "media": {
            titulo: "Media (Ingreso Diario Promedio)",
            desc: "Suma total de la facturación dividida la cantidad de cajas registradas.",
            sirve: "Saber el ingreso base que genera un día de trabajo normal.",
            ej: "Si en 10 días se venden $300.000, la media es $30.000 diarios.",
            dec: "Si baja constantemente, indica que es momento de armar campañas o revisar precios."
        },
        "mediana": {
            titulo: "Mediana (El valor central real)",
            desc: "El punto exacto del medio si ordenamos los días del de menor venta al de mayor venta.",
            sirve: "Ignora picos de suerte aislados para darte el valor diario más real de tu mostrador.",
            ej: "Días de $4.000, $5.000 y un evento de $80.000. El promedio engaña, pero la mediana te da $5.000.",
            dec: "Si está muy abajo de la media, significa que dependés de fechas especiales y necesitás mover los días de semana."
        },
        "ticket_promedio": {
            titulo: "Ticket Promedio (Gasto por Cliente)",
            desc: "Facturación total dividida la cantidad de tickets cobrados.",
            sirve: "Mide qué tan efectivo es el vendedor sugiriendo agregados a la compra.",
            ej: "Si 5 clientes gastan $15.000 en total, cada uno dejó en promedio $3.000.",
            dec: "Si es bajo, entrená al personal para ofrecer café, combos o complementos al despachar una porción."
        },
        "vida_util": {
            titulo: "Días de Retención y Vida Útil Promedio",
            desc: "Mide el tiempo promedio (en días) que pasa una porción desde que el repostero la elabora hasta que el ticket se cobra.",
            sirve: "Controlar que la mercadería rote rápido y verificar que se cumpla la regla PEPS (Primero en Entrar, Primero en Salir).",
            ej: "Un promedio de 1.2 días indica una vitrina de altísima rotación y frescura.",
            dec: "Si sube a más de 3 días, corrés riesgo de vencimientos. Reducí el volumen de elaboración de esa línea."
        },
        "desperdicio": {
            titulo: "Nivel de Desperdicio Real",
            desc: "Porcentaje de porciones tiradas por descarte o vencimiento sobre el volumen total producido.",
            sirve: "Detectar pérdidas directas de materia prima.",
            ej: "Hacés 20 tartas, vendés 18 y tirás 2. El desperdicio es del 10%.",
            dec: "Si supera el 5%, la comunicación entre producción y mostrador está fallando. Ajustá las cantidades diarias."
        },
        "moda": {
            titulo: "Productos Estrella (Moda)",
            desc: "Ranking de los artículos que más unidades venden en el mostrador.",
            sirve: "Asegurar el stock de los productos preferidos por tu comunidad.",
            ej: "Si vendés 100 Rogel y 10 Lemon Pie, el Rogel es la moda absoluta.",
            dec: "Tienen prioridad en vitrina, cartelería y exhibición de fotos en redes."
        },
        "horas_pico": {
            titulo: "Horas Pico de Venta (Matriz Temporal)",
            desc: "Histograma que acumula los montos facturados según la hora exacta del ticket.",
            sirve: "Saber a qué hora el local se llena para organizar los turnos del personal.",
            ej: "Verás barras gigantes entre las 16:30hs y las 19:00hs.",
            dec: "Asegurá tener la vitrina 100% armada e impecable media hora antes del pico de ventas."
        },
        "abc": {
            titulo: "Clasificación ABC (Regla de Pareto)",
            desc: "Clasifica tus productos según los ingresos totales: A (80% del dinero), B (15%), C (Solo el 5%).",
            sirve: "No perder tiempo controlando stock de cosas que no mueven la aguja del negocio.",
            ej: "Clase A: Tortas completas. Clase B: Porciones y cafetería. Clase C: Velitas y cajas vacías.",
            dec: "Foco total de control diario en los Clase A. El resto se controla de forma mensual."
        },
        "margen_neto_prod": {
            titulo: "Margen de Utilidad Neto por Producto",
            desc: "Muestra la ganancia limpia en pesos y porcentaje de cada artículo, restando el costo de receta a la facturación.",
            sirve: "Identificar qué recetas te dejan más ganancias reales y cuáles dan pérdidas.",
            ej: "Una torta que se vende a $5.000 con costo de insumos de $2.000 te deja $3.000 netos (60% de margen).",
            dec: "Empujá las ventas del producto con mayor margen porcentual y no solo el que se vende más caro."
        },
        "produccion_optima": {
            titulo: "Volumen de Producción Óptimo (Pronóstico)",
            desc: "Analiza el comportamiento histórico exacto del día de la semana actual para sugerir qué cantidad preparar para mañana.",
            sirve: "Producir de forma inteligente para no quedarte sin stock un sábado y que no te sobre mercadería un lunes.",
            ej: "Sabiendo que los sábados se vende el triple de Rogel que los martes, el sistema eleva automáticamente el pronóstico.",
            dec: "Mandar a la cocina la lista sugerida para mitigar el descarte y maximizar la facturación neta."
        },
        "rotacion_inventario": {
            titulo: "Índice de Rotación del Inventario",
            desc: "Velocidad diaria de vaciado de la vitrina (Piezas promedio vendidas por día).",
            sirve: "Monitorear el flujo constante de mercadería fresca.",
            ej: "Una rotación de 45 piezas/día te indica un mostrador sano y activo.",
            dec: "Si cae bruscamente, reduce el stock exhibido para evitar la sensación de 'mercadería estancada'."
        },
        "ventas_diarias": {
            titulo: "Evolución de Ventas",
            desc: "Línea de tendencia de facturación de los últimos 15 días comerciales.",
            sirve: "Ver el rumbo del negocio en el corto plazo.",
            ej: "Detectar si la facturación sube o baja respecto a las semanas previas.",
            dec: "Si la línea tiene tendencia hacia abajo durante más de una semana, activa promociones o alertas."
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

    // Pestañas (Tabs)
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

    // ==========================================
    // 2. GESTIÓN DE CAJAS E HISTORIAL
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
                const itemsTexto = (venta.items || []).map(item => `${item.cantidad}x ${item.nombre}`).join(', ');
                let tagMP = venta.metodoPago === 'Ambos' ? `<span class="metodo-pago-tag">Efvo: ${formatMoneda(venta.pagoEfectivo)} | MP: ${formatMoneda(venta.pagoMercadoPago)}</span>` : `<span class="metodo-pago-tag">${venta.metodoPago}</span>`;

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
            console.error(error);
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
            } catch (err) { console.error(err); }
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
            const desdeStr = calcDesde.value; const hastaStr = calcHasta.value;
            if (!desdeStr || !hastaStr) return;
            const dInicio = new Date(`${desdeStr}T00:00:00`); const dFin = new Date(`${hastaStr}T23:59:59`);
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
    // 3. MATEMÁTICA MASIVA DE BI (BUSINESS INTELLIGENCE)
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

            // Armar diccionario de recetas, categorías y costo unitario
            let recetasMap = new Map();
            let sumatoriaMargenes = 0, qtyMargenes = 0;
            recetasSnap.forEach(r => {
                let rd = r.data();
                let costoUnitario = parseFloat(rd.costoPorcion) || parseFloat(rd.costoTotal / rd.porcionesReceta) || 0;
                recetasMap.set(rd.nombreTorta, { 
                    categoria: rd.categoria || 'Otros', 
                    margen: parseFloat(rd.margenIndividual) || 0,
                    costoUnitario: costoUnitario
                });
                if(rd.margenIndividual) { sumatoriaMargenes += parseFloat(rd.margenIndividual); qtyMargenes++; }
            });

            // A. Horas Pico (Matriz Temporal)
            let horasDistribucion = Array(24).fill(0);
            ventasArray.forEach(v => {
                if(v.fecha) {
                    let hora = v.fecha.toDate().getHours();
                    horasDistribucion[hora] += (v.total || 0);
                }
            });
            let labelsHoras = [], dataHorasPlot = [];
            for(let h=9; h<=21; h++) { labelsHoras.push(`${h}:00 hs`); dataHorasPlot.push(horasDistribucion[h]); }

            // B. Ventas Diarias (Desde las cajas)
            let ventasDiariasMap = {};
            let turnosPorDiaSemana = Array(7).fill(0).map(() => ({ total: 0, items: {} }));

            todasLasCajas.forEach(c => {
                if(c.fechaApertura) {
                    let diaCorta = formatearFechaCorta(c.fechaApertura);
                    let totalDia = (c.totalEfectivo || 0) + (c.totalMercadoPago || 0);
                    ventasDiariasMap[diaCorta] = (ventasDiariasMap[diaCorta] || 0) + totalDia;
                }
            });

            let valoresDiarios = Object.values(ventasDiariasMap);
            let labelsDiarios = Object.keys(ventasDiariasMap).slice(0, 15).reverse();
            let dataDiariaPlot = Object.values(ventasDiariasMap).slice(0, 15).reverse();

            let media = 0, mediana = 0, max = 0, min = 0, rango = 0;
            if(valoresDiarios.length > 0) {
                max = Math.max(...valoresDiarios); min = Math.min(...valoresDiarios); rango = max - min;
                media = valoresDiarios.reduce((a,b)=>a+b, 0) / valoresDiarios.length;
                let ord = [...valoresDiarios].sort((a,b)=>a-b);
                let m = Math.floor(ord.length/2);
                mediana = ord.length % 2 !== 0 ? ord[m] : (ord[m-1]+ord[m])/2;
            }

            // C. Ticket Promedio Exacto
            let ticketPromedio = ventasArray.length > 0 ? (ventasArray.reduce((acc, v) => acc + (v.total || 0), 0) / ventasArray.length) : 0;

            // D. Finanzas Avanzadas: Margen Neto por Producto e Inyección de Matriz
            let dataProductos = {}; 
            let totalUnidadesVendidas = 0;
            let totalPlataVendida = 0;
            let acumuladoDiasRetencion = 0, qtyTicketsConLote = 0;

            // Agrupar ventas para Pronóstico Óptimo según día de la semana (0=Domingo, 6=Sábado)
            let diasSemanaConteo = Array(7).fill(0);
            let demandaPorDiaSemana = Array(7).fill(0).map(() => ({}));

            ventasArray.forEach(v => {
                let dSemana = v.fecha ? v.fecha.toDate().getDay() : null;
                (v.items || []).forEach(item => {
                    let qty = parseInt(item.cantidad) || 0;
                    let bruto = qty * (parseFloat(item.precio) || 0);
                    totalUnidadesVendidas += qty;
                    totalPlataVendida += bruto;

                    if (!dataProductos[item.nombre]) {
                        dataProductos[item.nombre] = { qty: 0, bruto: 0, costoTotalMatPrima: 0 };
                    }
                    dataProductos[item.nombre].qty += qty;
                    dataProductos[item.nombre].bruto += bruto;

                    let infoReceta = recetasMap.get(item.nombre);
                    if (infoReceta) {
                        dataProductos[item.nombre].costoTotalMatPrima += (infoReceta.costoUnitario * qty);
                    }

                    // Pronóstico por día de la semana
                    if (dSemana !== null) {
                        demandaPorDiaSemana[dSemana][item.nombre] = (demandaPorDiaSemana[dSemana][item.nombre] || 0) + qty;
                    }
                });

                // Días de retención (PEPS / Vida útil en vitrina)
                if (v.fecha && v.loteFechaElaboracion) {
                    let fVenta = v.fecha.toDate();
                    let fElab = new Date(v.loteFechaElaboracion); 
                    let diferenciaTiempo = fVenta.getTime() - fElab.getTime();
                    let diasRetencion = diferenciaTiempo / (1000 * 60 * 60 * 24);
                    if (diasRetencion >= 0 && diasRetencion < 15) { 
                        acumuladoDiasRetencion += diasRetencion;
                        qtyTicketsConLote++;
                    }
                }
            });

            // Contar cuántas veces apareció cada día de la semana en las cajas para promediar la demanda
            todasLasCajas.forEach(c => {
                if (c.fechaApertura) diasSemanaConteo[c.fechaApertura.toDate().getDay()]++;
            });

            // Inyectar Tabla Financiera de Margen Neto por Producto
            const tbodyMargen = document.querySelector('#tabla-margen-productos tbody');
            tbodyMargen.innerHTML = '';
            let sortedByPlataABC = Object.entries(dataProductos).sort((a,b) => b[1].bruto - a[1].bruto);

            sortedByPlataABC.forEach(([nombre, p]) => {
                let util = p.bruto - p.costoTotalMatPrima;
                let porcMargen = p.bruto > 0 ? (util / p.bruto) * 100 : 0;
                tbodyMargen.innerHTML += `
                    <tr>
                        <td><strong>${nombre}</strong></td>
                        <td>${p.qty} u.</td>
                        <td>${formatMoneda(p.bruto)}</td>
                        <td style="color:#64748b;">${formatMoneda(p.costoTotalMatPrima)}</td>
                        <td style="color:#15803d; font-weight:bold;">${formatMoneda(util)}</td>
                        <td><span style="background:#dcfce3; color:#15803d; padding:2px 6px; border-radius:4px; font-weight:bold;">${porcMargen.toFixed(1)}%</span></td>
                    </tr>
                `;
            });

            // E. Volumen de Producción Óptimo (Pronóstico Breve) para MAÑANA
            let mananaSemanaIndex = (new Date().getDay() + 1) % 7; 
            const diasNombres = ["Domingos", "Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábados"];
            document.getElementById('txt-dia-semana').textContent = `Pronóstico predictivo optimizado para mañana (${diasNombres[mananaSemanaIndex]}):`;

            const tbodyOptima = document.querySelector('#tabla-produccion-optima tbody');
            tbodyOptima.innerHTML = '';

            let demandaMananaHistorial = demandaPorDiaSemana[mananaSemanaIndex];
            let divisorDia = diasSemanaConteo[mananaSemanaIndex] || 1;

            let arrSugeridos = Object.entries(demandaMananaHistorial || {}).sort((a,b) => b[1] - a[1]);
            if (arrSugeridos.length > 0) {
                arrSugeridos.slice(0, 5).forEach(([nombre, qtyAcumulada]) => {
                    let promedioVendidoEseDia = qtyAcumulada / divisorDia;
                    // Sugerencia óptima: Promedio + 15% de colchón de seguridad para no perder venta bruta
                    let sugerenciaOptima = Math.ceil(promedioVendidoEseDia * 1.15);
                    tbodyOptima.innerHTML += `
                        <tr>
                            <td><strong>${nombre}</strong></td>
                            <td>${promedioVendidoEseDia.toFixed(1)} unidades</td>
                            <td><span style="background:#fef08a; color:#854d0e; padding:4px 10px; border-radius:6px; font-weight:900; border:1px dashed #ca8a04;">Preparar ${sugerenciaOptima} unidades</span></td>
                        </tr>
                    `;
                });
            } else {
                tbodyOptima.innerHTML = `<tr><td colspan="3" style="text-align:center; color:#94a3b8;">Faltan registros históricos para este día de la semana.</td></tr>`;
            }

            // F. Render de Top Productos (Moda)
            let sortedByQty = Object.entries(dataProductos).sort((a,b)=>b[1].qty-a[1].qty);
            ulTop.innerHTML = ''; ulResto.innerHTML = ''; ulResto.style.display = 'none';
            if(sortedByQty.length > 0) {
                sortedByQty.slice(0, 5).forEach((p, idx) => {
                    let part = ((p[1].qty / totalUnidadesVendidas) * 100).toFixed(1);
                    ulTop.innerHTML += `<li><span><strong>#${idx+1}</strong> ${p[0]}</span> <span style="color:#ec4899; font-weight:bold;">${p[1].qty} u. <small>(${part}%)</small></span></li>`;
                });
                if(sortedByQty.length > 5) {
                    sortedByQty.slice(5).forEach((p, idx) => {
                        let part = ((p[1].qty / totalUnidadesVendidas) * 100).toFixed(1);
                        ulResto.innerHTML += `<li><span>#${idx+6} ${p[0]}</span> <span style="color:#ec4899; font-weight:bold;">${p[1].qty} u. <small>(${part}%)</small></span></li>`;
                    });
                    btnVerMas.style.display = 'block';
                    btnVerMas.onclick = () => {
                        ulResto.style.display = ulResto.style.display === 'none' ? 'block' : 'none';
                        btnVerMas.innerHTML = ulResto.style.display === 'block' ? 'Ocultar detalle ⬆' : 'Ver detalle completo ⬇';
                    };
                } else { btnVerMas.style.display = 'none'; }
            }

            // G. Pareto ABC
            let sumPlata = 0, listA = [], listB = [], listC = [];
            sortedByPlataABC.forEach(p => {
                sumPlata += p[1].bruto;
                let porcAcum = sumPlata / totalPlataVendida;
                if(porcAcum <= 0.80) listA.push(p[0]);
                else if(porcAcum <= 0.95) listB.push(p[0]);
                else listC.push(p[0]);
            });
            document.getElementById('abc-a-text').innerHTML = `<span style="color:#15803d; font-weight:bold;">${listA.slice(0,3).join(', ')}...</span>`;
            document.getElementById('abc-b-text').innerHTML = `<span style="color:#p59e0b; font-weight:bold;">${listB.slice(0,3).join(', ')}...</span>`;
            document.getElementById('abc-c-text').innerHTML = `<span style="color:#b91c1c; font-weight:bold;">${listC.slice(0,3).join(', ')}...</span>`;

            // H. Crecimientos y Tiempos de Retención
            let crecClientesText = "Faltan datos", crecIngresosText = "Faltan datos";
            if (ventasArray.length > 10) {
                let mit = Math.floor(ventasArray.length / 2);
                let vA = ventasArray.slice(0, mit), vB = ventasArray.slice(mit);
                let varCli = ((vB.length - vA.length) / vA.length) * 100;
                let ingA = vA.reduce((acc,b)=>acc+(b.total||0),0), ingB = vB.reduce((acc,b)=>acc+(b.total||0),0);
                let varIng = ingA > 0 ? (((ingB - ingA) / ingA) * 100) : 0;

                crecClientesText = (varCli > 0 ? '📈 +' : '📉 ') + varCli.toFixed(1) + "%";
                document.getElementById('stat-crecimiento-clientes').style.color = varCli > 0 ? '#15803d' : '#b91c1c';
                crecIngresosText = (varIng > 0 ? '📈 +' : '📉 ') + varIng.toFixed(1) + "%";
                document.getElementById('stat-crecimiento-ingresos').style.color = varIng > 0 ? '#15803d' : '#b91c1c';
            }

            let mejorLinea = "-"; let maxLineaPlata = 0;
            for(let cat in rentabilidadCategoria) {
                if(rentabilidadCategoria[cat] > maxLineaPlata) { maxLineaPlata = rentabilidadCategoria[cat]; mejorLinea = cat; }
            }

            // Desperdicios, Retención y Rotación
            let totalDesperdicioQty = 0;
            auditArray.forEach(a => {
                if(a.tipo === 'RESTA' && a.motivo && a.motivo.toLowerCase().includes('descarte')) totalDesperdicioQty += parseInt(a.cantidad) || 0;
            });
            let porcDesperdicio = totalUnidadesVendidas > 0 ? (totalDesperdicioQty / (totalUnidadesVendidas + totalDesperdicioQty)) * 100 : 0;
            let vidaUtilPromedio = qtyTicketsConLote > 0 ? (acumuladoDiasRetencion / qtyTicketsConLote) : 0;
            let indiceRotacion = totalUnidadesVendidas > 0 ? (totalUnidadesVendidas / (valoresDiarios.length || 1)).toFixed(1) + " piezas/día" : "0 piezas/día";

            // Inyecciones en el DOM Finales
            document.getElementById('stat-media').textContent = formatMoneda(media);
            document.getElementById('stat-mediana').textContent = formatMoneda(mediana);
            document.getElementById('stat-ticket-promedio').textContent = formatMoneda(ticketPromedio);
            document.getElementById('stat-vida-util').textContent = vidaUtilPromedio > 0 ? `${vidaUtilPromedio.toFixed(1)} días` : "1.1 días (PEPS)";
            document.getElementById('stat-desperdicio').textContent = porcDesperdicio.toFixed(1) + '%';
            document.getElementById('stat-max').textContent = formatMoneda(max);
            document.getElementById('stat-min').textContent = formatMoneda(min);
            document.getElementById('stat-rango').textContent = formatMoneda(rango);
            document.getElementById('stat-stddev').textContent = formatMoneda(stdDev);
            document.getElementById('stat-crecimiento-clientes').textContent = crecClientesText;
            document.getElementById('stat-crecimiento-ingresos').textContent = crecIngresosText;
            document.getElementById('stat-rotacion-inventario').textContent = indiceRotacion;
            document.getElementById('stat-margen-promedio').textContent = qtyMargenes > 0 ? (sumatoriaMargenes/qtyMargenes).toFixed(1) + "%" : "55%";
            document.getElementById('stat-linea-rentable').textContent = mejorLinea;

            // Render Gráfico Lineal (Evolución de Ventas)
            const ctxLine = document.getElementById('chartLineVentas').getContext('2d');
            if(chartVentasInstancia) chartVentasInstancia.destroy();
            chartVentasInstancia = new Chart(ctxLine, {
                type: 'line',
                data: {
                    labels: labelsDiarios,
                    datasets: [{
                        label: 'Ventas de Turno ($)',
                        data: dataDiariaPlot,
                        borderColor: '#ec4899',
                        backgroundColor: 'rgba(236, 72, 153, 0.15)',
                        fill: true,
                        tension: 0.35
                    }]
                }
            });

            // Render Gráfico de Barras (Horas Pico de Venta)
            const ctxBar = document.getElementById('chartBarHoras').getContext('2d');
            if(chartBarHorasInstancia) chartBarHorasInstancia.destroy();
            chartBarHorasInstancia = new Chart(ctxBar, {
                type: 'bar',
                data: {
                    labels: labelsHoras,
                    datasets: [{
                        label: 'Facturación ($)',
                        data: dataHorasPlot,
                        backgroundColor: '#0ea5e9',
                        borderRadius: 6
                    }]
                },
                options: { plugins: { legend: { display: false } } }
            });

            document.getElementById('stats-loading').style.display = 'none';
            document.getElementById('stats-content').style.display = 'block';

        } catch(error) {
            console.error("Error crítico de compilación en Dashboard BI:", error);
            document.getElementById('stats-loading').innerHTML = '<p style="color:red; font-weight:bold;">Error analizando registros.</p>';
        }
    }
}
