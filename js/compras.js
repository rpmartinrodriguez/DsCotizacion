import { 
    getFirestore, collection, addDoc, doc, updateDoc, 
    query, where, getDocs, arrayUnion
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
        try {
            const snapshot = await getDocs(query(materiasPrimasCollection));
            productosExistentes = [];
            datalist.innerHTML = '';
            snapshot.forEach(doc => {
                const data = doc.data();
                productosExistentes.push(data);
                const option = document.createElement('option');
                option.value = data.nombre;
                datalist.appendChild(option);
            });
        } catch (error) {
            console.error("Error al cargar productos existentes:", error);
        }
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

        // Leemos los 4 valores del formulario
        const nombre = nombreInput.value.trim();
        const precioPorUnidad = parseFloat(form['precio-compra'].value);
        const unidadesCompradas = parseInt(form['unidades-compradas'].value, 10);
        const cantidadPorUnidad = parseFloat(form['cantidad-por-unidad'].value);
        const unidad = unidadSelect.value;

        if (!nombre || isNaN(precioPorUnidad) || isNaN(unidadesCompradas) || isNaN(cantidadPorUnidad) || unidadesCompradas <= 0 || cantidadPorUnidad <= 0) {
            alert("Por favor, completa todos los campos con valores numéricos válidos y positivos.");
            return;
        }
        
        // --- NUEVA LÓGICA DE CÁLCULO ---
        const precioTotalCompra = precioPorUnidad * unidadesCompradas;
        const cantidadTotalComprada = cantidadPorUnidad * unidadesCompradas;
        const costoUnitarioFinal = precioTotalCompra / cantidadTotalComprada;

        const nuevoLote = {
            fechaCompra: new Date(),
            precioCompra: precioTotalCompra, // Guardamos el precio total calculado
            cantidadComprada: cantidadTotalComprada, // Guardamos la cantidad total calculada
            stockRestante: cantidadTotalComprada, // El stock inicial es la cantidad total
            costoUnitario: costoUnitarioFinal, // Guardamos el costo unitario real
            // Guardamos los detalles de la compra para futura referencia si es necesario
            detalleDeCompra: {
                unidades: unidadesCompradas,
                contenido: cantidadPorUnidad,
                precioPorUnidad: precioPorUnidad
            }
        };

        try {
            const q = query(materiasPrimasCollection, where("nombre", "==", nombre));
            const querySnapshot = await getDocs(q);

            let productoId;
            
            if (querySnapshot.empty) {
                // El producto es NUEVO
                const nuevoProductoRef = await addDoc(materiasPrimasCollection, {
                    nombre: nombre,
                    unidad: unidad,
                    lotes: [nuevoLote]
                });
                productoId = nuevoProductoRef.id;
            } else {
                // El producto YA EXISTE, añadimos un nuevo lote
                const productoDoc = querySnapshot.docs[0];
                productoId = productoDoc.id;
                await updateDoc(doc(db, 'materiasPrimas', productoId), {
                    lotes: arrayUnion(nuevoLote)
                });
            }

            // Registramos el movimiento de stock
            await addDoc(movimientosStockCollection, {
                materiaPrimaId: productoId,
                materiaPrimaNombre: nombre,
                tipo: 'Compra',
                cantidad: cantidadTotalComprada, // Registramos la cantidad total
                fecha: new Date(),
                descripcion: `Compra de ${unidadesCompradas} x ${cantidadPorUnidad} ${unidad}`
            });
            
            alert(`¡Compra de "${nombre}" registrada con éxito!`);
            form.reset();
            unidadSelect.disabled = false;
            await cargarProductosExistentes();

        } catch (error) {
            console.error("Error detallado al guardar la compra: ", error);
            alert("Hubo un error al guardar la compra. Revisa la consola.");
        }
    });
    
    // Carga inicial
    cargarProductosExistentes();
}
