// js/compras.js
import { 
    getFirestore, collection, addDoc, doc, updateDoc, 
    query, where, getDocs, arrayUnion 
} from "https://www.gstatic.com/firebasejs/9.15.0/firebase-firestore.js";

export function setupCompras(app) {
    const db = getFirestore(app);
    const materiasPrimasCollection = collection(db, 'materiasPrimas');
    const form = document.getElementById('form-nueva-compra');
    const datalist = document.getElementById('lista-productos-existentes');

    const cargarProductosExistentes = async () => {
        const snapshot = await getDocs(materiasPrimasCollection);
        datalist.innerHTML = '';
        snapshot.forEach(doc => {
            const option = document.createElement('option');
            option.value = doc.data().nombre;
            datalist.appendChild(option);
        });
    };
    
    cargarProductosExistentes();

    form.addEventListener('submit', async (e) => {
        e.preventDefault();

        const nombre = form['nombre-producto'].value.trim();
        const precio = parseFloat(form['precio-compra'].value);
        const cantidad = parseFloat(form['cantidad-compra'].value);
        const unidad = form['unidad-medida'].value;

        if (!nombre || isNaN(precio) || isNaN(cantidad) || cantidad <= 0) {
            alert("Por favor, completa todos los campos con valores válidos.");
            return;
        }

        const nuevoLote = {
            fechaCompra: new Date(),
            precioCompra: precio,
            cantidadComprada: cantidad,
            stockRestante: cantidad,
            costoUnitario: precio / cantidad
        };

        try {
            const q = query(materiasPrimasCollection, where("nombre", "==", nombre));
            const querySnapshot = await getDocs(q);

            if (querySnapshot.empty) {
                await addDoc(materiasPrimasCollection, {
                    nombre: nombre,
                    unidad: unidad,
                    lotes: [nuevoLote]
                });
                alert(`¡Nuevo producto "${nombre}" creado y primer lote guardado!`);
            } else {
                const productoDoc = querySnapshot.docs[0];
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
