import {
    getFirestore, collection, onSnapshot, query, where
} from "https://www.gstatic.com/firebasejs/9.15.0/firebase-firestore.js";

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

    const db = getFirestore(app);
    // Solo documentos abiertos; no descargar historiales, ventas ni presupuestos.
    // La consulta es informativa y no permite operar sobre fondos.
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
