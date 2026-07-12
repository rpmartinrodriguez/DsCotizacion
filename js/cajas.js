import { 
    getFirestore, collection, onSnapshot, query, orderBy, getDocs, where, updateDoc, doc 
} from "https://www.gstatic.com/firebasejs/9.15.0/firebase-firestore.js";

export function setupCajas(app) {
    const db = getFirestore(app);
    const cajasCollection = collection(db, 'cajas');
    const ventasCollection = collection(db, 'ventasMostrador');
    const auditoriaCollection = collection(db, 'auditoriaMostrador');
    const recetasCollection = collection(db, 'recetas');

    // DOM Elements
    const listaCajasContainer = document.getElementById('lista-cajas-container');
    const filtroMesSelect = document.getElementById('filtro-mes-cajas');
    
    const btnCalcularFacturacion = document.getElementById('btn-calcular-facturacion');
    const calcDesde = document.getElementById('calc-desde');
    const calcHasta = document.getElementById('calc-hasta');
    const resultadoFacturacion = document.getElementById('resultado-facturacion');
    const resTotalMp = document.getElementById('res-total-mp');
    const resFacturadoMp = document.getElementById('res-facturado-mp');
    const resPendienteMp = document.getElementById('res-pendiente-mp');

    // Tabs
    const tabBtnHistorial = document.getElementById('tab-btn-historial');
    const tabBtnEstadisticas = document.getElementById('tab-btn-estadisticas');
    const sectionHistorial = document.getElementById('section-historial');
    const sectionEstadisticas = document.getElementById('section-estadisticas');

    // Info Modal
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
    let chartCategoriasInstancia = null;

    // DICCIONARIO DE INFORMACIÓN PARA LOS ICONOS (i)
    const infoDiccionario = {
        "media": {
            titulo: "Media (Promedio)",
            desc: "Es el valor total de tus ventas dividido por la cantidad de días trabajados.",
            sirve: "Para saber cuánto dinero entra en promedio por día a tu caja.",
            ej: "Si el lunes vendés $10.000 y el martes $20.000, tu media es de $15.000 diarios.",
            dec: "Si tu media es menor a tus costos fijos diarios, tenés que aumentar precios o hacer promociones para subir el volumen."
        },
        "mediana": {
            titulo: "Mediana",
            desc: "Si ordenamos todos tus días de ventas del peor al mejor, la mediana es el día que queda exactamente en el medio.",
            sirve: "Es más real que el promedio. Evita que un día extraordinario (como el Día de la Madre) distorsione tu visión del negocio normal.",
            ej: "Vendés: $2.000, $3.000 y un día de fiesta $50.000. El promedio da $18.000 (falso), pero la mediana te da $3.000 (la realidad de tu local).",
            dec: "Si la mediana es mucho más baja que tu promedio, dependés demasiado de fechas especiales. Creá estrategias para los días flojos."
        },
        "moda": {
            titulo: "Productos Estrella (Moda)",
            desc: "Son los productos que más unidades venden. En estadística se le llama 'Moda' al valor que más se repite.",
            sirve: "Para identificar cuáles son los artículos 'gancho' que atraen a la gente a tu local.",
            ej: "Vendés 50 alfajores, 10 tortas y 5 cafés. Tu producto estrella es el Alfajor.",
            dec: "Nunca te quedes sin stock de estos productos. Son ideales para hacer combos (ej: llevá el Alfajor estrella + un café)."
        },
        "desperdicio": {
            titulo: "Nivel de Desperdicio",
            desc: "Porcentaje de productos que tuviste que tirar a la basura sobre el total de lo que produjiste.",
            sirve: "Mide qué tan eficiente es tu producción frente a la demanda real.",
            ej: "Hacés 100 sándwiches, vendés 90 y tirás 10. Tu desperdicio es del 10%.",
            dec: "Si supera el 5%, estás perdiendo plata. Ajustá tus recetas, hacé tandas más chicas o usá el sistema de Lotes (PEPS) para vender lo más viejo primero."
        },
        "abc": {
            titulo: "Clasificación ABC de Inventario",
            desc: "Agrupa tus productos en 3 categorías basándose en cuánta plata te dejan (Regla de Pareto).",
            sirve: "Para no perder el tiempo controlando productos que no te dan ganancias.",
            ej: "Clase A (Tus tortas caras), Clase B (Cafés y facturas), Clase C (Golosinas baratas).",
            dec: "Clase A: Contá el stock todos los días. Clase C: Comprá mucho bulto y controlalo una vez por mes, no importa si sobra."
        },
        "estrategicos": {
            titulo: "Indicadores Estratégicos (KPIs)",
            desc: "Miden la salud general de tu negocio a nivel macro (Crecimiento y Márgenes).",
            sirve: "Para saber si tu negocio se está estancando, creciendo o perdiendo rentabilidad.",
            ej: "Si tu 'Crecimiento de Ingresos' sube, pero tu 'Crecimiento de Clientes' baja, significa que vendés más caro a menos gente.",
            dec: "Analizá el Margen Promedio: si es bajo, tus costos de materia prima están comiéndose tu ganancia. Ajustá tu receta o cambiá de proveedor."
        },
        "dispersion": {
            titulo: "Medidas de Dispersión",
            desc: "Miden qué tan caóticas o estables son tus ventas usando Varianza y Desviación Estándar.",
            sirve: "Para saber qué tan predecible es tu negocio.",
            ej: "Un local estable vende $10.000 todos los días. Un local inestable vende $2.000 un lunes y $30.000 un viernes.",
            dec: "Si la desviación es muy alta (número grande), tu negocio es riesgoso. Cuidá tu fondo de caja para sobrevivir a los días 'pobres'."
        },
        "ventas_diarias": {
            titulo: "Gráfico de Ventas Diarias",
            desc: "Muestra la facturación neta (Efectivo + MercadoPago) de los últimos 15 días en los que abriste la caja.",
            sirve: "Visualizar rápidamente la tendencia del local.",
            ej: "Vas a ver picos los fines de semana y valles los martes.",
            dec: "Identificá los valles (días bajos) y colocá promociones agresivas esos días para estabilizar la curva."
        }
    };

    document.addEventListener('click', (e) => {
        if (e.target.classList.contains('info-icon')) {
            const key = e.target.dataset.info;
            const data = infoDiccionario[key];
            if (data) {
                infoTitle.textContent = data.titulo;
                infoDesc.textContent = data.desc;
                infoSirve.textContent = data.sirve;
                infoEj.textContent = data.ej;
                infoDec.textContent = data.dec;
                modalInfo.style.display = 'flex';
            }
        }
    });

    btnCerrarInfo.addEventListener('click', () => {
        modalInfo.style.display = 'none';
    });


    // Funciones Helper
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
    // 2. RENDERIZAR LA LISTA DE CAJAS
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

    // ==========================================
    // 6. MATEMÁTICA Y DASHBOARD ESTADÍSTICO
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
            // Ordenar ventas más antiguas a más nuevas para cálculos de crecimiento temporal
            ventasArray.sort((a,b) => (a.fecha?.seconds || 0) - (b.fecha?.seconds || 0));

            let auditArray = [];
            auditSnap.forEach(a => auditArray.push(a.data()));

            let recetasMap = new Map();
            let sumatoriaMargenes = 0;
            let qtyMargenes = 0;
            recetasSnap.forEach(r => {
                let rd = r.data();
                recetasMap.set(rd.nombreTorta, { categoria: rd.categoria || 'Otros', margen: parseFloat(rd.margenIndividual) || null });
                if(rd.margenIndividual) {
                    sumatoriaMargenes += parseFloat(rd.margenIndividual);
                    qtyMargenes++;
                }
            });

            // 1. Procesar Ventas Diarias
            let ventasDiariasMap = {};
            todasLasCajas.forEach(c => {
                if(c.fechaApertura) {
                    let dia = formatearFechaCorta(c.fechaApertura);
                    let totalDia = (c.totalEfectivo || 0) + (c.totalMercadoPago || 0);
                    ventasDiariasMap[dia] = (ventasDiariasMap[dia] || 0) + totalDia;
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

            // 2. Procesar Productos y Clasificación ABC (Basado en Plata Generada)
            let conteoProductosQty = {};
            let conteoProductosPlata = {};
            let rentabilidadCategoria = {}; // Acumulado de ventas por categoría
            let conteoCategorias = {};
            let totalUnidadesVendidas = 0;
            let totalPlataVendida = 0;

            ventasArray.forEach(v => {
                (v.items || []).forEach(item => {
                    let qty = parseInt(item.cantidad) || 0;
                    let montoTotalItem = qty * (parseFloat(item.precio) || 0);
                    
                    totalUnidadesVendidas += qty;
                    totalPlataVendida += montoTotalItem;

                    conteoProductosQty[item.nombre] = (conteoProductosQty[item.nombre] || 0) + qty;
                    conteoProductosPlata[item.nombre] = (conteoProductosPlata[item.nombre] || 0) + montoTotalItem;
                    
                    let cat = (recetasMap.get(item.nombre) || {categoria: 'Otros'}).categoria;
                    conteoCategorias[cat] = (conteoCategorias[cat] || 0) + qty;
                    rentabilidadCategoria[cat] = (rentabilidadCategoria[cat] || 0) + montoTotalItem;
                });
            });

            // TOP PRODUCTOS (MODA)
            let sortedByQty = Object.entries(conteoProductosQty).sort((a,b)=>b[1]-a[1]);
            
            const ulTop = document.getElementById('lista-top-productos');
            const ulResto = document.getElementById('lista-resto-productos');
            const btnVerMas = document.getElementById('btn-ver-mas-productos');
            
            ulTop.innerHTML = '';
            ulResto.innerHTML = '';
            ulResto.style.display = 'none';

            if(sortedByQty.length > 0) {
                // Primeros 5
                sortedByQty.slice(0, 5).forEach((p, idx) => {
                    let participacion = ((p[1] / totalUnidadesVendidas) * 100).toFixed(1);
                    ulTop.innerHTML += `<li><span><strong>#${idx+1}</strong> ${p[0]}</span> <span style="color:#ec4899; font-weight:bold;">${p[1]} u. <small>(${participacion}%)</small></span></li>`;
                });
                
                // Resto
                if(sortedByQty.length > 5) {
                    sortedByQty.slice(5).forEach((p, idx) => {
                        let participacion = ((p[1] / totalUnidadesVendidas) * 100).toFixed(1);
                        ulResto.innerHTML += `<li><span>#${idx+6} ${p[0]}</span> <span style="color:#ec4899; font-weight:bold;">${p[1]} u. <small>(${participacion}%)</small></span></li>`;
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
                ulTop.innerHTML = '<li>No hay ventas registradas.</li>';
            }

            // Lógica Clasificación ABC
            let sortedByPlata = Object.entries(conteoProductosPlata).sort((a,b)=>b[1]-a[1]);
            let sumPlata = 0;
            let listA = [], listB = [], listC = [];

            sortedByPlata.forEach(p => {
                sumPlata += p[1];
                let porcentajeAcumulado = sumPlata / totalPlataVendida;
                
                if(porcentajeAcumulado <= 0.80) {
                    listA.push(p[0]);
                } else if(porcentajeAcumulado <= 0.95) {
                    listB.push(p[0]);
                } else {
                    listC.push(p[0]);
                }
            });

            document.getElementById('abc-a-text').textContent = listA.slice(0,5).join(', ') + (listA.length > 5 ? '...' : '');
            document.getElementById('abc-b-text').textContent = listB.slice(0,5).join(', ') + (listB.length > 5 ? '...' : '');
            document.getElementById('abc-c-text').textContent = listC.slice(0,5).join(', ') + (listC.length > 5 ? '...' : '');


            // Lógica Crecimiento Clientes e Ingresos (Comparar primera mitad vs segunda mitad temporal de los datos)
            let crecClientesText = "-";
            let crecIngresosText = "-";

            if (ventasArray.length > 10) {
                let mitad = Math.floor(ventasArray.length / 2);
                let primeraMitad = ventasArray.slice(0, mitad);
                let segundaMitad = ventasArray.slice(mitad);

                let clientesA = primeraMitad.length;
                let clientesB = segundaMitad.length;
                let varClientes = ((clientesB - clientesA) / clientesA) * 100;
                crecClientesText = (varClientes > 0 ? '📈 +' : '📉 ') + varClientes.toFixed(1) + "%";
                document.getElementById('stat-crecimiento-clientes').style.color = varClientes > 0 ? '#15803d' : '#b91c1c';

                let ingresosA = primeraMitad.reduce((a,b)=>a+(b.total||0), 0);
                let ingresosB = segundaMitad.reduce((a,b)=>a+(b.total||0), 0);
                let varIngresos = ((ingresosB - ingresosA) / ingresosA) * 100;
                crecIngresosText = (varIngresos > 0 ? '📈 +' : '📉 ') + varIngresos.toFixed(1) + "%";
                document.getElementById('stat-crecimiento-ingresos').style.color = varIngresos > 0 ? '#15803d' : '#b91c1c';
            } else {
                crecClientesText = "Faltan datos";
                crecIngresosText = "Faltan datos";
            }

            // Línea más rentable (La que más plata bruta dejó)
            let mejorLinea = "-";
            let maxLineaPlata = 0;
            for(let cat in rentabilidadCategoria) {
                if(rentabilidadCategoria[cat] > maxLineaPlata) {
                    maxLineaPlata = rentabilidadCategoria[cat];
                    mejorLinea = cat;
                }
            }


            // 3. Procesar Desperdicio
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

            // Actualizar DOM KPIs Básicos
            document.getElementById('stat-media').textContent = formatMoneda(media);
            document.getElementById('stat-mediana').textContent = formatMoneda(mediana);
            document.getElementById('stat-desperdicio').textContent = porcentajeDesperdicio.toFixed(1) + '%';
            
            // Dispersión
            document.getElementById('stat-max').textContent = formatMoneda(max);
            document.getElementById('stat-min').textContent = formatMoneda(min);
            document.getElementById('stat-rango').textContent = formatMoneda(rango);
            document.getElementById('stat-varianza').textContent = formatMoneda(varianza);
            document.getElementById('stat-stddev').textContent = formatMoneda(stdDev);

            // KPIs Negocio
            let promedioMargenGlobal = qtyMargenes > 0 ? (sumatoriaMargenes/qtyMargenes).toFixed(1) + "%" : "Sin Datos";
            document.getElementById('stat-crecimiento-clientes').textContent = crecClientesText;
            document.getElementById('stat-crecimiento-ingresos').textContent = crecIngresosText;
            document.getElementById('stat-margen-promedio').textContent = promedioMargenGlobal;
            document.getElementById('stat-linea-rentable').textContent = mejorLinea;

            // DIBUJAR GRÁFICOS
            const ctxLine = document.getElementById('chartLineVentas').getContext('2d');
            if(chartVentasInstancia) chartVentasInstancia.destroy();
            chartVentasInstancia = new Chart(ctxLine, {
                type: 'line',
                data: {
                    labels: labelsDiarios,
                    datasets: [{
                        label: 'Venta Global Neta ($)',
                        data: dataDiariaPlot,
                        borderColor: '#ec4899',
                        backgroundColor: 'rgba(236, 72, 153, 0.2)',
                        fill: true,
                        tension: 0.4
                    }]
                }
            });

            const ctxPie = document.getElementById('chartPieCategorias').getContext('2d');
            if(chartCategoriasInstancia) chartCategoriasInstancia.destroy();
            chartCategoriasInstancia = new Chart(ctxPie, {
                type: 'doughnut',
                data: {
                    labels: Object.keys(conteoCategorias),
                    datasets: [{
                        data: Object.values(conteoCategorias),
                        backgroundColor: ['#ec4899', '#8b5cf6', '#0ea5e9', '#f59e0b', '#10b981', '#f43f5e']
                    }]
                }
            });

            document.getElementById('stats-loading').style.display = 'none';
            document.getElementById('stats-content').style.display = 'block';

        } catch(error) {
            console.error("Error calculando KPIs:", error);
            document.getElementById('stats-loading').innerHTML = '<p style="color:red;">Error de conexión procesando los datos.</p>';
        }
    }
}
