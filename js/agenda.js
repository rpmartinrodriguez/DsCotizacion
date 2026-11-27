import { 
    getFirestore, collection, onSnapshot, query, where, Timestamp
} from "https://www.gstatic.com/firebasejs/9.15.0/firebase-firestore.js";

import {orderDate} from './core/orders.js';
export function setupAgenda(app,session={}) {
    const abort=new AbortController();let stop=null,revision=0;
    const status=document.getElementById('ds-agenda-status');
    const uid=session.auth?.currentUser?.uid||'';
    const key='ds-agenda-month:'+uid;
    const on=(el,event,callback)=>el.addEventListener(event,callback,{signal:abort.signal});
    const db = getFirestore(app);
    const presupuestosCollection = collection(db, 'presupuestosGuardados');

    const monthYearDisplay = document.getElementById('month-year-display');
    const calendarioGrid = document.getElementById('calendario-grid');
    const prevMonthBtn = document.getElementById('prev-month-btn');
    const nextMonthBtn = document.getElementById('next-month-btn');

    // Referencias a la nueva modal
    const diaModal = document.getElementById('agenda-dia-modal');
    const modalTitle = document.getElementById('agenda-modal-title');
    const modalLista = document.getElementById('agenda-modal-lista');
    const modalBtnCerrar = document.getElementById('agenda-modal-btn-cerrar');

    const localToday=orderDate(new Date()).split('-').map(Number);
    let currentDate = new Date(localToday[0],localToday[1]-1,1);
    try{const saved=localStorage.getItem(key);if(/^\d{4}-(0[1-9]|1[0-2])$/.test(saved||'')){const [y,m]=saved.split('-').map(Number);if(y>=2000&&y<=2100)currentDate=new Date(y,m-1,1);}}catch{}
    let entregas = [];

    const meses = ["Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio", "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"];

    const renderCalendar = () => {
        const year = currentDate.getFullYear();
        const month = currentDate.getMonth();
        monthYearDisplay.textContent = `${meses[month]} ${year}`;
        
        const celdasViejas = calendarioGrid.querySelectorAll('.calendario-dia');
        celdasViejas.forEach(celda => celda.remove());

        const primerDiaDelMes = new Date(year, month, 1).getDay();
        const diasEnElMes = new Date(year, month + 1, 0).getDate();

        for (let i = 0; i < primerDiaDelMes; i++) {
            const celdaVacia = document.createElement('div');
            celdaVacia.className = 'calendario-dia vacia';
            calendarioGrid.appendChild(celdaVacia);
        }

        for (let i = 1; i <= diasEnElMes; i++) {
            const celdaDia = document.createElement('div');
            celdaDia.className = 'calendario-dia';
            
            const numeroDia = document.createElement('span');
            numeroDia.textContent = i;
            celdaDia.appendChild(numeroDia);

            const hoy=orderDate(new Date());
            const dayKey=year+'-'+String(month+1).padStart(2,'0')+'-'+String(i).padStart(2,'0');
            if (dayKey===hoy) {
                celdaDia.classList.add('hoy');
            }

            const entregasDelDia=entregas.filter(e=>orderDate(e.data.fechaEntrega)===dayKey);

            if (entregasDelDia.length > 0) {
                celdaDia.classList.add('con-eventos'); // Clase para hacerla clicable
                celdaDia.dataset.date = `${year}-${month + 1}-${i}`; // Guardamos la fecha

                const listaEntregas = document.createElement('ul');
                listaEntregas.className = 'lista-entregas';
                entregasDelDia.forEach(() => {
                    const itemEntrega = document.createElement('li');
                    itemEntrega.className = 'item-entrega';
                    listaEntregas.appendChild(itemEntrega);
                });
                celdaDia.appendChild(listaEntregas);
            }
            calendarioGrid.appendChild(celdaDia);
        }
    };

    const mostrarModalConEntregas = (fechaString) => {
        const [year, month, day] = fechaString.split('-').map(Number);
        const fechaSeleccionada = new Date(year, month - 1, day);
        
        modalTitle.textContent = `Entregas del ${fechaSeleccionada.toLocaleDateString('es-AR', {day: 'numeric', month: 'long'})}`;

        const dayKey=year+'-'+String(month).padStart(2,'0')+'-'+String(day).padStart(2,'0');
        const entregasDelDia=entregas.filter(e=>orderDate(e.data.fechaEntrega)===dayKey);

        modalLista.innerHTML = '';
        if (entregasDelDia.length > 0) {
            const ul = document.createElement('ul');
            ul.className = 'lista-sencilla';
            entregasDelDia.forEach(entrega => {
                const li = document.createElement('li');

                const producto = document.createElement('span');
                producto.textContent = entrega.data.tituloTorta || 'Pedido';

                const cliente = document.createElement('span');
                cliente.textContent = (entrega.data.nombreCliente || 'Sin cliente')+' · '+({confirmado:'Confirmado',produccion:'En producción',listo:'Listo',entregado:'Entregado'}[entrega.data.estadoPedido]||'Confirmado');

                li.append(producto, cliente);
                ul.appendChild(li);
            });
            modalLista.appendChild(ul);
        }

        diaModal.classList.add('visible');
    };

    on(calendarioGrid,'click', (e) => {
        const celda = e.target.closest('.calendario-dia.con-eventos');
        if (celda) {
            mostrarModalConEntregas(celda.dataset.date);
        }
    });

    on(modalBtnCerrar,'click', () => diaModal.classList.remove('visible'));
    on(diaModal,'click', e => {
        if(e.target === diaModal) diaModal.classList.remove('visible');
    });

    on(prevMonthBtn,'click', () => {
        currentDate.setMonth(currentDate.getMonth() - 1);loadMonth();
    });

    on(nextMonthBtn,'click', () => {
        currentDate.setMonth(currentDate.getMonth() + 1);loadMonth();
    });

    function loadMonth(){
        const id=++revision;stop?.();stop=null;entregas=[];renderCalendar();
        const y=currentDate.getFullYear(),m=currentDate.getMonth()+1;
        const month=y+'-'+String(m).padStart(2,'0'),next=new Date(y,m,1);
        const nextMonth=next.getFullYear()+'-'+String(next.getMonth()+1).padStart(2,'0');
        try{localStorage.setItem(key,month);}catch{}
        if(status)status.textContent='Cargando entregas…';
        // Consultar sólo el mes visible; filtrar confirmados localmente para no exigir índices compuestos.
        const q=query(presupuestosCollection,where('fechaEntrega','>=',Timestamp.fromDate(new Date(month+'-01T00:00:00-03:00'))),where('fechaEntrega','<',Timestamp.fromDate(new Date(nextMonth+'-01T00:00:00-03:00'))));
        stop=onSnapshot(q,snapshot=>{
            if(id!==revision||abort.signal.aborted)return;
            entregas=snapshot.docs.map(d=>({id:d.id,data:d.data()})).filter(p=>p.data.esVenta===true&&p.data.fechaEntrega?.toDate);
            renderCalendar();if(status)status.textContent=entregas.length+' entregas en este mes'+(snapshot.metadata.fromCache?' · datos en caché':'');
        },error=>{if(id!==revision||abort.signal.aborted)return;entregas=[];renderCalendar();if(status)status.textContent='No se pudieron cargar las entregas. Revisá la conexión.';});
    }
    loadMonth();
    return ()=>{revision++;abort.abort();stop?.();};
}
