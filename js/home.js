import {
    getFirestore, collection, doc, onSnapshot, query, where, Timestamp
} from "https://www.gstatic.com/firebasejs/9.15.0/firebase-firestore.js";
import { calculateProductSalePrice, getEffectiveUnitCost } from "./core/pricing.js";
import { formatCurrency } from "./core/format.js";
import {orderDate,orderStage} from "./core/orders.js";

export function setupInicio(app) {
    const fecha = document.getElementById('ds-home-date');
    const estado = document.getElementById('ds-home-caja-indicator');
    const mensaje = document.getElementById('ds-home-caja-message');
    const detalle = document.getElementById('ds-home-caja-detail');

    if (fecha) {
        fecha.textContent = new Intl.DateTimeFormat('es-AR', {
            weekday: 'long', day: 'numeric', month: 'long', year: 'numeric'
        }).format(new Date());
    }

    const marcar = (texto, titulo, descripcion, clase = '') => {
        if (estado) {
            estado.className = 'ds-home-pill' + (clase ? ' ' + clase : '');
            estado.textContent = texto;
        }
        if (mensaje) mensaje.textContent = titulo;
        if (detalle) detalle.textContent = descripcion;
    };

    const reviewMargin = document.getElementById('ds-review-margin');
    const reviewSuggested = document.getElementById('ds-review-suggested');
    const reviewWeb = document.getElementById('ds-review-web');
    const reviewSuppliers = document.getElementById('ds-review-suppliers');
    const reviewCosts = document.getElementById('ds-review-costs');
    const reviewStatus = document.getElementById('ds-home-review-status');
    const reviewHelp = document.getElementById('ds-home-review-help');

    let reviewRecipes = [];
    let reviewMaterials = new Map();
    let reviewGlobalMargin = 0;
    let reviewLoadedRecipes = false;
    let reviewLoadedMaterials = false;

    const setReviewCount = (element, value) => {
        if (element) element.textContent = Number(value || 0).toLocaleString('es-AR');
    };

    const renderReviewCenter = () => {
        if (!reviewLoadedRecipes || !reviewLoadedMaterials) return;

        let marginRisk = 0;
        let suggestedOnly = 0;
        let webMissing = 0;
        let incompleteCosts = 0;

        reviewRecipes.forEach(recipe => {
            const sale = calculateProductSalePrice(recipe, reviewMaterials, reviewGlobalMargin);
            const hasManual = sale.manualPrice !== null;
            if (!hasManual) suggestedOnly += 1;
            if (recipe.precioWebHabilitado !== true) webMissing += 1;

            if (hasManual && sale.suggestedPrice > 0 && sale.price > 0) {
                const gapPct = ((sale.suggestedPrice - sale.price) / sale.suggestedPrice) * 100;
                if (gapPct >= 10) marginRisk += 1;
            }

            const ingredients = Array.isArray(recipe.ingredientes) ? recipe.ingredientes : [];
            if (ingredients.some(item => getEffectiveUnitCost(reviewMaterials.get(item.idMateriaPrima)) <= 0)) {
                incompleteCosts += 1;
            }
        });

        const supplierAlerts = [...reviewMaterials.values()].filter(material => {
            const variation = Number(material?.proveedorVariacionPct);
            return Number.isFinite(variation) && Math.abs(variation) >= 10;
        }).length;

        setReviewCount(reviewMargin, marginRisk);
        setReviewCount(reviewSuggested, suggestedOnly);
        setReviewCount(reviewWeb, webMissing);
        setReviewCount(reviewSuppliers, supplierAlerts);
        setReviewCount(reviewCosts, incompleteCosts);

        const total = marginRisk + supplierAlerts + incompleteCosts;
        if (reviewStatus) {
            reviewStatus.textContent = total > 0
                ? `${total} señal${total === 1 ? '' : 'es'} prioritaria${total === 1 ? '' : 's'} para revisar.`
                : 'No hay señales prioritarias detectadas.';
        }
    };

    document.addEventListener('click', event => {
        const info = event.target.closest('[data-home-help]');
        if (!info || !reviewHelp) return;
        reviewHelp.textContent = info.dataset.homeHelp || '';
        reviewHelp.hidden = false;
    });

    const db = getFirestore(app);
    const kpi=(id,value)=>{const el=document.getElementById(id);if(el)el.textContent=value;};
    const updateConnection=()=>{const el=document.getElementById('ds-connection-status');if(el){el.textContent=navigator.onLine?'Con conexión':'Sin conexión';el.dataset.online=String(navigator.onLine);}};
    updateConnection();window.addEventListener('online',updateConnection);window.addEventListener('offline',updateConnection);
    const today=orderDate(new Date()),start=new Date(today+'T00:00:00-03:00'),end=new Date(start.getTime()+86400000);
    onSnapshot(query(collection(db,'ventasMostrador'),where('fecha','>=',Timestamp.fromDate(start)),where('fecha','<',Timestamp.fromDate(end))),snap=>{
        const sales=snap.docs.map(d=>d.data()).filter(d=>d.eliminada!==true);
        kpi('ds-today-sales',formatCurrency(sales.reduce((sum,d)=>sum+(Number(d.total)||0),0)));kpi('ds-today-tickets',sales.length.toLocaleString('es-AR'));
    },()=>{kpi('ds-today-sales','No disponible');kpi('ds-today-tickets','—');});
    onSnapshot(query(collection(db,'presupuestosGuardados'),where('esVenta','==',true)),snap=>{
        const active=snap.docs.map(d=>d.data()).filter(p=>orderStage(p)!=='entregado');
        kpi('ds-today-orders',active.length.toLocaleString('es-AR'));kpi('ds-today-deliveries',active.filter(p=>orderDate(p.fechaEntrega)===today).length.toLocaleString('es-AR'));
    },()=>{kpi('ds-today-orders','—');kpi('ds-today-deliveries','—');});
    // Solo documentos abiertos; no descargar historiales, ventas ni presupuestos.
    // La consulta es informativa y no permite operar sobre fondos.
    onSnapshot(doc(db, 'config', 'mostrador'), snapshot => {
        reviewGlobalMargin = snapshot.exists() ? Number(snapshot.data().margenGlobal) || 0 : 0;
        renderReviewCenter();
    }, error => {
        console.warn('No se pudo leer el margen global para revisiones:', error);
    });

    onSnapshot(collection(db, 'materiasPrimas'), snapshot => {
        reviewMaterials = new Map(snapshot.docs.map(material => [material.id, { id: material.id, ...material.data() }]));
        reviewLoadedMaterials = true;
        renderReviewCenter();
    }, error => {
        console.warn('No se pudieron leer materias primas para revisiones:', error);
        if (reviewStatus) reviewStatus.textContent = 'No se pudo completar el análisis de insumos.';
    });

    onSnapshot(collection(db, 'recetas'), snapshot => {
        reviewRecipes = snapshot.docs.map(recipe => ({ id: recipe.id, ...recipe.data() }));
        reviewLoadedRecipes = true;
        renderReviewCenter();
    }, error => {
        console.warn('No se pudieron leer productos para revisiones:', error);
        if (reviewStatus) reviewStatus.textContent = 'No se pudo completar el análisis de productos.';
    });

    onSnapshot(query(collection(db, 'cajas'), where('estado', '==', 'abierta')),
        snapshot => {
            if (snapshot.empty) {
                marcar('Cerrada', 'No hay una caja abierta.',
                    'Desde Mostrador podés iniciar un nuevo turno.', 'is-closed');
                return;
            }
            if (snapshot.size > 1) {
                marcar('Revisar', 'Hay varias cajas abiertas.',
                    'Ingresá a Cajas para verificar los turnos activos.');
                return;
            }
            const caja = snapshot.docs[0].data();
            const nombre = String(caja.usuarioNombre || 'El equipo');
            const turno = caja.turno ? ' · Turno ' + String(caja.turno) : '';
            marcar('Abierta', 'La caja está en funcionamiento.',
                nombre + turno + '.', 'is-open');
        },
        error => {
            console.error('No se pudo consultar el estado operativo de caja:', error);
            marcar('Sin datos', 'No se pudo verificar la caja.',
                'Revisá la conexión y los permisos. Podés continuar desde Mostrador.');
        }
    );
}
