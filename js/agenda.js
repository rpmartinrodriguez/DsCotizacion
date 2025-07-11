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

    let currentDate = new Date();
    let entregas = [];

    const meses = ["Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio", "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"];

    const renderCalendar = () => {
        const year = currentDate.getFullYear();
        const month = currentDate.getMonth();

        monthYearDisplay.textContent = `${meses[month]} ${year}`;
        
        // Limpiamos solo las celdas de los días, no los encabezados de la semana
        const celdasViejas = calendarioGrid.querySelectorAll('.calendario-dia');
        celdasViejas.forEach(celda => celda.remove());

        const primerDiaDelMes = new Date(year, month, 1).getDay(); // 0=Domingo, 1=Lunes...
        const diasEnElMes = new Date(year, month + 1, 0).getDate();

        // Creamos las celdas vacías para alinear el primer día del mes
        for (let i = 0; i < primerDiaDelMes; i++) {
            const celdaVacia = document.createElement('div');
            celdaVacia.className = 'calendario-dia vacia';
            calendarioGrid.appendChild(celdaVacia);
        }

        // Creamos las celdas para cada día del mes
        for (let i = 1; i <= diasEnElMes; i++) {
            const celdaDia = document.createElement('div');
            celdaDia.className = 'calendario-dia';
            
            const numeroDia = document.createElement('span');
            numeroDia.textContent = i;
            celdaDia.appendChild(numeroDia);

            // Resaltar el día de hoy
            const hoy = new Date();
            if (i === hoy.getDate() && month === hoy.getMonth() && year === hoy.getFullYear()) {
                celdaDia.classList.add('hoy');
            }

            // Buscamos si hay entregas para este día
            const fechaCelda = new Date(year, month, i);
            const entregasDelDia = entregas.filter(entrega => {
                const fechaEntrega = entrega.data.fechaEntrega.toDate();
                return fechaEntrega.getFullYear() === fechaCelda.getFullYear() &&
                       fechaEntrega.getMonth() === fechaCelda.getMonth() &&
                       fechaEntrega.getDate() === fechaCelda.getDate();
            });

            // Si hay entregas, las mostramos
            if (entregasDelDia.length > 0) {
                const listaEntregas = document.createElement('ul');
                listaEntregas.className = 'lista-entregas';
                entregasDelDia.forEach(entrega => {
                    const itemEntrega = document.createElement('li');
                    itemEntrega.className = 'item-entrega';
                    itemEntrega.textContent = `${entrega.data.tituloTorta}`;
                    itemEntrega.title = `Cliente: ${entrega.data.nombreCliente}`;
                    listaEntregas.appendChild(itemEntrega);
                });
                celdaDia.appendChild(listaEntregas);
            }
            
            calendarioGrid.appendChild(celdaDia);
        }
    };

    prevMonthBtn.addEventListener('click', () => {
        currentDate.setMonth(currentDate.getMonth() - 1);
        renderCalendar();
    });

    nextMonthBtn.addEventListener('click', () => {
        currentDate.setMonth(currentDate.getMonth() + 1);
        renderCalendar();
    });

    // Buscamos todos los presupuestos que son ventas confirmadas
    const q = query(presupuestosCollection, where("esVenta", "==", true));
    
    onSnapshot(q, (snapshot) => {
        entregas = snapshot.docs.map(doc => ({ id: doc.id, data: doc.data() }));
        renderCalendar(); // Volvemos a dibujar el calendario con los datos actualizados
    }, (error) => {
        console.error("Error al obtener datos de la agenda: ", error);
        monthYearDisplay.textContent = "Error";
        calendarioGrid.innerHTML += '<p style="color:red; grid-column: 1 / -1;">No se pudo cargar la agenda.</p>';
    });
}
