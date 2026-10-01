async function obtenerSesionAutorizada() {
    try {
        const [
            firebaseAppModule,
            firebaseAuthModule,
            firebaseFirestoreModule,
            configModule
        ] = await Promise.all([
            import("https://www.gstatic.com/firebasejs/9.15.0/firebase-app.js"),
            import("https://www.gstatic.com/firebasejs/9.15.0/firebase-auth.js"),
            import("https://www.gstatic.com/firebasejs/9.15.0/firebase-firestore.js"),
            import("./firebase-config.js")
        ]);

        const { getApps, getApp } = firebaseAppModule;
        const { getAuth, onAuthStateChanged, signOut } = firebaseAuthModule;
        const { getFirestore, doc, getDoc } = firebaseFirestoreModule;
        let app = getApps().find((candidate) => candidate.name === '[DEFAULT]');

        for (let intento = 0; !app && intento < 120; intento += 1) {
            await new Promise((resolve) => setTimeout(resolve, 25));
            app = getApps().find((candidate) => candidate.name === '[DEFAULT]');
        }

        if (!app) {
            throw new Error('La aplicación principal de Firebase no se inicializó.');
        }

        app = getApp();
        const auth = getAuth(app);
        const db = getFirestore(app);

        const user = await new Promise((resolve) => {
            const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
                unsubscribe();
                resolve(currentUser);
            });
        });

        if (!user || user.isAnonymous) {
            return { autorizado: false, auth, signOut };
        }

        const perfilSnap = await getDoc(doc(db, 'usuarios', user.uid));
        if (!perfilSnap.exists()) {
            return { autorizado: false, auth, signOut };
        }

        const perfil = perfilSnap.data();
        if (perfil.estado !== 'activo') {
            return { autorizado: false, auth, signOut };
        }

        const rol = perfil.rol || 'empleado';
        const permisos = perfil.permisos || {};

        localStorage.setItem('userPermisos', JSON.stringify(permisos));
        localStorage.setItem('userName', perfil.nombre || user.email || 'Usuario');
        localStorage.setItem('userRol', rol);

        return {
            autorizado: true,
            auth,
            signOut,
            rol,
            permisos,
            perfil
        };
    } catch (error) {
        console.error("No se pudo validar la sesión:", error);
        return { autorizado: false };
    }
}

function permisosCompletos() {
    return {
        mostrador: true,
        indicadores: true,
        recetas: true,
        stock: true,
        presupuestos: true,
        precios: true,
        cajas: true,
        finanzas: true,
        historial: true,
        compras: true,
        compras_lista: true,
        clientes: true,
        agenda: true,
        modelos: true,
        configuracion: true
    };
}

async function inicializarMenu() {
    const navMenu = document.getElementById('nav-menu');
    const menuToggleBtn = document.getElementById('menu-toggle-btn') || document.getElementById('menu-toggle');
    const navOverlay = document.getElementById('nav-overlay') || document.getElementById('menu-overlay');

    const session = await obtenerSesionAutorizada();

    if (!session.autorizado) {
        localStorage.removeItem('userPermisos');
        localStorage.removeItem('userName');
        localStorage.removeItem('userRol');
        if (!window.location.pathname.endsWith('/login.html')) {
            window.location.replace('login.html');
        }
        return;
    }

    const userRol = session.rol;
    const p = userRol === 'master' ? permisosCompletos() : session.permisos;

    let archivoActual = window.location.pathname.split('/').pop().split('?')[0].split('#')[0];
    if (!archivoActual) archivoActual = 'index.html';

    const accesos = {
        'pos.html': p.mostrador,
        'index.html': p.indicadores,
        'recetas.html': p.recetas,
        'stock.html': p.stock,
        'presupuesto.html': p.presupuestos,
        'cotizacion-actual.html': p.presupuestos || p.mostrador,
        'precios.html': p.precios,
        'cajas.html': p.cajas,
        'finanzas.html': p.finanzas,
        'historial.html': p.historial,
        'compras.html': p.compras,
        'compras-lista.html': p.compras_lista,
        'clientes.html': p.clientes,
        'agenda.html': p.agenda,
        'modelos.html': p.modelos,
        'usuarios.html': p.configuracion || userRol === 'master'
    };

    if (archivoActual !== 'login.html' && Object.prototype.hasOwnProperty.call(accesos, archivoActual) && accesos[archivoActual] !== true) {
        if (p.mostrador) window.location.replace('pos.html');
        else if (p.indicadores) window.location.replace('index.html');
        else if (p.stock) window.location.replace('stock.html');
        else if (p.agenda) window.location.replace('agenda.html');
        else window.location.replace('login.html');
        return;
    }

    if (!navMenu) return;

    const nombre = session.perfil?.nombre || 'Dulce Sall';

    let htmlMenu = `
        <div class="nav-menu__header">
            <img src="assets/logo.png" alt="Dulce Sall" class="header__logo" style="height:40px;">
            <div>
                <span class="nav-menu__title">Dulce Sall</span>
                <small style="display:block;color:#8b8189;font-size:.72rem;margin-top:2px;">${nombre}</small>
            </div>
        </div>
    `;

    if (p.mostrador || p.indicadores || p.recetas || p.stock || p.presupuestos || p.precios) {
        htmlMenu += `<div class="nav-category"><button class="nav-category-btn">Operación <span class="nav-icon">+</span></button><div class="nav-category-content">`;

        if (p.indicadores) htmlMenu += `<a href="index.html" class="nav-menu__link"><span>⌂</span> Inicio</a>`;
        if (p.mostrador) htmlMenu += `<a href="pos.html" class="nav-menu__link"><span>▣</span> Mostrador</a>`;
        if (p.stock) htmlMenu += `<a href="stock.html" class="nav-menu__link"><span>◇</span> Stock</a>`;
        if (p.recetas) htmlMenu += `<a href="recetas.html" class="nav-menu__link"><span>○</span> Productos y recetas</a>`;
        if (p.presupuestos) htmlMenu += `<a href="presupuesto.html" class="nav-menu__link"><span>▤</span> Presupuestos</a>`;
        if (p.precios) htmlMenu += `<a href="precios.html" class="nav-menu__link"><span>＄</span> Listas de precios</a>`;

        htmlMenu += `</div></div>`;
    }

    if (p.clientes || p.agenda || p.modelos) {
        htmlMenu += `<div class="nav-category"><button class="nav-category-btn">Comercial <span class="nav-icon">+</span></button><div class="nav-category-content">`;

        if (p.clientes) htmlMenu += `<a href="clientes.html" class="nav-menu__link"><span>◎</span> Clientes</a>`;
        if (p.agenda) htmlMenu += `<a href="agenda.html" class="nav-menu__link"><span>□</span> Agenda y entregas</a>`;
        if (p.modelos) htmlMenu += `<a href="modelos.html" class="nav-menu__link"><span>△</span> Modelos 3D</a>`;

        htmlMenu += `</div></div>`;
    }

    if (p.cajas || p.finanzas || p.historial || p.compras || p.compras_lista || p.configuracion || userRol === 'master') {
        htmlMenu += `<div class="nav-category"><button class="nav-category-btn">Administración <span class="nav-icon">+</span></button><div class="nav-category-content">`;

        if (p.cajas) htmlMenu += `<a href="cajas.html" class="nav-menu__link"><span>▱</span> Cajas</a>`;
        if (p.finanzas) htmlMenu += `<a href="finanzas.html" class="nav-menu__link"><span>◫</span> Finanzas</a>`;
        if (p.compras) htmlMenu += `<a href="compras.html" class="nav-menu__link"><span>＋</span> Registrar compra</a>`;
        if (p.compras_lista) htmlMenu += `<a href="compras-lista.html" class="nav-menu__link"><span>≡</span> Lista de compras</a>`;
        if (p.historial) htmlMenu += `<a href="historial.html" class="nav-menu__link"><span>↺</span> Historial</a>`;
        if (p.configuracion || userRol === 'master') htmlMenu += `<a href="usuarios.html" class="nav-menu__link"><span>⚙</span> Usuarios y permisos</a>`;

        htmlMenu += `</div></div>`;
    }

    htmlMenu += `
        <div style="padding:1rem;border-top:1px solid #eee8ef;margin-top:auto;">
            <button id="btn-cerrar-sesion-menu" class="btn-secondary" style="width:100%;color:#b4232c;background:#fff;border:1px solid #f2d7da;box-shadow:none;">Cerrar sesión</button>
        </div>
    `;

    navMenu.innerHTML = htmlMenu;

    const closeMenu = () => {
        navMenu.classList.remove('active');
        document.body.classList.remove('menu-open');
        if (navOverlay) navOverlay.classList.remove('active');
    };

    if (menuToggleBtn) {
        const nuevoBoton = menuToggleBtn.cloneNode(true);
        menuToggleBtn.parentNode.replaceChild(nuevoBoton, menuToggleBtn);
        nuevoBoton.addEventListener('click', (event) => {
            event.preventDefault();
            navMenu.classList.toggle('active');
            document.body.classList.toggle('menu-open');
            if (navOverlay) navOverlay.classList.toggle('active');
        });
    }

    if (navOverlay) navOverlay.addEventListener('click', closeMenu);

    document.querySelectorAll('.nav-category-btn').forEach((btn) => {
        btn.addEventListener('click', () => {
            const content = btn.nextElementSibling;
            const icon = btn.querySelector('.nav-icon');

            if (content.style.maxHeight) {
                content.style.maxHeight = null;
                if (icon) icon.textContent = '+';
            } else {
                content.style.maxHeight = content.scrollHeight + 'px';
                if (icon) icon.textContent = '−';
            }
        });
    });

    document.querySelectorAll('.nav-menu__link').forEach((link) => {
        const href = link.getAttribute('href');

        if (href && archivoActual === href.split('?')[0]) {
            link.classList.add('active');
            const parentContent = link.closest('.nav-category-content');
            if (parentContent) {
                parentContent.style.maxHeight = parentContent.scrollHeight + 'px';
                const icon = parentContent.previousElementSibling?.querySelector('.nav-icon');
                if (icon) icon.textContent = '−';
            }
        }
    });

    const btnCerrarSesion = document.getElementById('btn-cerrar-sesion-menu');
    if (btnCerrarSesion) {
        btnCerrarSesion.addEventListener('click', async () => {
            btnCerrarSesion.disabled = true;
            btnCerrarSesion.textContent = 'Cerrando…';

            try {
                if (session.auth && session.signOut) {
                    await session.signOut(session.auth);
                }
            } catch (error) {
                console.error("Error al cerrar sesión:", error);
            } finally {
                localStorage.clear();
                window.location.replace('login.html');
            }
        });
    }
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', inicializarMenu);
} else {
    inicializarMenu();
}
