// js/compras.js (Versión corregida)

import { 
    getFirestore, collection, addDoc, doc, updateDoc, 
    query, where, getDocs, arrayUnion 
} from "https://www.gstatic.com/firebasejs/9.15.0/firebase-firestore.js";

export function setupCompras(app) {
    const db = getFirestore(app);
    const materiasPrimasCollection = collection(db, 'materiasPrimas');
    const form = document.getElementById('form-nueva-compra');
    const datalist = document.getElementById('lista-productos-existentes');

    console.log("Módulo de Compras cargado.");

    const cargarProductosExistentes = async () => {
        const snapshot = await getDocs(materiasPrimasCollection);
        datalist.innerHTML = '';
        snapshot.forEach(doc => {
            const option = document.createElement('option');
            option.value = doc.data().nombre;
            datalist.appendChild(option);
        });
        console.log("Lista de productos para autocompletar cargada.");
    };
    cargarProductosExistentes();

    form.addEventListener('submit', async (e) => {
        e.preventDefault();
        console.log("Formulario de compra enviado.");

        const nombre = form['nombre-producto'].value.trim();
        const precio = parseFloat(form['precio-compra'].value);
        const cantidad = parseFloat(form['cantidad-compra'].value);
        const unidad = form['unidad-medida'].value;

        if (!nombre || isNaN(precio) || isNaN(cantidad) || cantidad <= 0) {
            alert("Por favor, completa todos los campos con valores válidos.");
            return;
        }

        // --- LA CORRECCIÓN ESTÁ AQUÍ ---
        const nuevoLote = {
            fechaCompra: new Date(), // Usamos la fecha del navegador en lugar de serverTimestamp()
            precioCompra: precio,
            cantidadComprada: cantidad,
            stockRestante: cantidad,
            costoUnitario: precio / cantidad
        };
        console.log("Nuevo lote preparado:", nuevoLote);

        try {
            console.log(`Buscando si el producto "${nombre}" ya existe...`);
            const q = query(materiasPrimasCollection, where("nombre", "==", nombre));
            const querySnapshot = await getDocs(q);

            if (querySnapshot.empty) {
                console.log(`Producto "${nombre}" no encontrado. Creando nuevo documento...`);
                // Al crear, Firestore convierte el objeto Date() a su propio formato Timestamp
                await addDoc(materiasPrimasCollection, {
                    nombre: nombre,
                    unidad: unidad,
                    lotes: [nuevoLote]
                });
                alert(`¡Nuevo producto "${nombre}" creado y primer lote guardado!`);
            } else {
                const productoDoc = querySnapshot.docs[0];
                console.log(`Producto "${nombre}" encontrado. Añadiendo nuevo lote al documento ${productoDoc.id}`);
                // arrayUnion funciona perfectamente con un objeto Date()
                await updateDoc(doc(db, 'materiasPrimas', productoDoc.id), {
                    lotes: arrayUnion(nuevoLote)
                });
                alert(`¡Nuevo lote de "${nombre}" añadido al stock!`);
            }
            
            form.reset();
            cargarProductosExistentes();

        } catch (error) {
            console.error("Error detallado al guardar la compra: ", error);
            alert("Hubo un error al guardar la compra. Revisa la consola.");
        }
    });
}
