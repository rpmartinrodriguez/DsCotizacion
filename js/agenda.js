import { 
    getFirestore, collection, onSnapshot, query, where
} from "https://www.gstatic.com/firebasejs/9.15.0/firebase-firestore.js";

export function setupAgenda(app) {
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

    let currentDate = new Date();
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

            const hoy = new Date();
            if (i === hoy.getDate() && month === hoy.getMonth() && year === hoy.getFullYear()) {
                celdaDia.classList.add('hoy');
            }

            const fechaCelda = new Date(year, month, i);
            const entregasDelDia = entregas.filter(entrega => {
                const fechaEntrega = entrega.data.fechaEntrega.toDate();
                return fechaEntrega.getFullYear() === fechaCelda.getFullYear() &&
                       fechaEntrega.getMonth() === fechaCelda.getMonth() &&
                       fechaEntrega.getDate() === fechaCelda.getDate();
            });

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

        const entregasDelDia = entregas.filter(entrega => {
            const fechaEntrega = entrega.data.fechaEntrega.toDate();
            return fechaEntrega.getFullYear() === fechaSeleccionada.getFullYear() &&
                   fechaEntrega.getMonth() === fechaSeleccionada.getMonth() &&
                   fechaEntrega.getDate() === fechaSeleccionada.getDate();
        });

        modalLista.innerHTML = '';
        if (entregasDelDia.length > 0) {
            const ul = document.createElement('ul');
            ul.className = 'lista-sencilla';
            entregasDelDia.forEach(entrega => {
                const li = document.createElement('li');
                li.innerHTML = `<span>${entrega.data.tituloTorta}</span> <span>${entrega.data.nombreCliente}</span>`;
                ul.appendChild(li);
            });
            modalLista.appendChild(ul);
        }

        diaModal.classList.add('visible');
    };

    calendarioGrid.addEventListener('click', (e) => {
        const celda = e.target.closest('.calendario-dia.con-eventos');
        if (celda) {
            mostrarModalConEntregas(celda.dataset.date);
        }
    });

    modalBtnCerrar.addEventListener('click', () => diaModal.classList.remove('visible'));
    diaModal.addEventListener('click', e => {
        if(e.target === diaModal) diaModal.classList.remove('visible');
    });

    prevMonthBtn.addEventListener('click', () => {
        currentDate.setMonth(currentDate.getMonth() - 1);
        renderCalendar();
    });

    nextMonthBtn.addEventListener('click', () => {
        currentDate.setMonth(currentDate.getMonth() + 1);
        renderCalendar();
    });

    const q = query(presupuestosCollection, where("esVenta", "==", true));
    onSnapshot(q, (snapshot) => {
        entregas = snapshot.docs.map(doc => ({ id: doc.id, data: doc.data() }));
        renderCalendar();
    });
}
