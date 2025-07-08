import { 
    getFirestore, collection, addDoc, doc, updateDoc, 
    query, where, getDocs, arrayUnion, writeBatch
} from "https://www.gstatic.com/firebasejs/9.15.0/firebase-firestore.js";

export function setupCompras(app) {
    const db = getFirestore(app);
    const materiasPrimasCollection = collection(db, 'materiasPrimas');
    const movimientosStockCollection = collection(db, 'movimientosStock');

    const form = document.getElementById('form-nueva-compra');
    const datalist = document.getElementById('lista-productos-existentes');
    const unidadSelect = document.getElementById('unidad-medida');
    const nombreInput = document.getElementById('nombre-producto');

    let productosExistentes = [];
    const cargarProductosExistentes = async () => {
        const snapshot = await getDocs(materiasPrimasCollection);
        productosExistentes = [];
        datalist.innerHTML = '';
        snapshot.forEach(doc => {
            const data = doc.data();
            productosExistentes.push(data);
            const option = document.createElement('option');
            option.value = data.nombre;
            datalist.appendChild(option);
        });
    };
    
    nombreInput.addEventListener('input', () => {
        const productoSeleccionado = productosExistentes.find(p => p.nombre === nombreInput.value);
        if (productoSeleccionado) {
            unidadSelect.value = productoSeleccionado.unidad;
            unidadSelect.disabled = true;
        } else {
            unidadSelect.disabled = false;
        }
    });

    form.addEventListener('submit', async (e) => {
        e.preventDefault();
        const nombre = nombreInput.value.trim();
        const precio = parseFloat(form['precio-compra'].value);
        const cantidad = parseFloat(form['cantidad-compra'].value);
        const unidad = unidadSelect.value;
        if (!nombre || isNaN(precio) || isNaN(cantidad) || cantidad <= 0) {
            alert("Por favor, completa todos los campos con valores válidos.");
            return;
        }

        const nuevoLote = { fechaCompra: new Date(), precioCompra: precio, cantidadComprada: cantidad, stockRestante: cantidad, costoUnitario: precio / cantidad };

        try {
            const q = query(materiasPrimasCollection, where("nombre", "==", nombre));
            const querySnapshot = await getDocs(q);

            const batch = writeBatch(db);
            let productoId;
            
            if (querySnapshot.empty) {
                const nuevoProductoRef = doc(collection(db, 'materiasPrimas'));
                productoId = nuevoProductoRef.id;
                batch.set(nuevoProductoRef, { nombre, unidad, lotes: [nuevoLote] });
            } else {
                const productoDocRef = querySnapshot.docs[0].ref;
                productoId = productoDocRef.id;
                batch.update(productoDocRef, { lotes: arrayUnion(nuevoLote) });
            }

            const nuevoMovimientoRef = doc(collection(db, 'movimientosStock'));
            batch.set(nuevoMovimientoRef, {
                materiaPrimaId: productoId,
                materiaPrimaNombre: nombre,
                tipo: 'Compra',
                cantidad: cantidad,
                fecha: new Date(),
                descripcion: `Compra de ${cantidad} ${unidad}`
            });

            await batch.commit();
            
            alert(`¡Compra de "${nombre}" registrada con éxito!`);
            form.reset();
            unidadSelect.disabled = false;
            await cargarProductosExistentes();
        } catch (error) {
            console.error("Error al guardar la compra: ", error);
            alert("Hubo un error al guardar la compra.");
        }
    });
    
    cargarProductosExistentes();
}
