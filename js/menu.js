async function obtenerSesionAutorizada() {
    try {
        const [
            firebaseAppModule,
            firebaseAuthModule,
            firebaseFirestoreModule
        ] = await Promise.all([
            import("https://www.gstatic.com/firebasejs/9.15.0/firebase-app.js"),
            import("https://www.gstatic.com/firebasejs/9.15.0/firebase-auth.js"),
            import("https://www.gstatic.com/firebasejs/9.15.0/firebase-firestore.js")
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

const MENU_ICON = {
    menu: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" aria-hidden="true"><path d="M4 6h16M4 12h16M4 18h16"></path></svg>',
    home: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><path d="M3 11 12 3l9 8"></path><path d="M5 10v11h14V10"></path></svg>',
    pos: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><path d="M4 9h16l-1-5H5L4 9Z"></path><path d="M5 9v11h14V9"></path><path d="M9 14h6"></path></svg>',
    stock: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><path d="m12 3 8 4-8 4-8-4 8-4Z"></path><path d="m4 12 8 4 8-4M4 17l8 4 8-4"></path></svg>',
    recipes: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><path d="M6 3h12v18H6z"></path><path d="M9 7h6M9 11h6M9 15h4"></path></svg>',
    quote: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><path d="M6 2h9l4 4v16H6V2Z"></path><path d="M14 2v5h5M9 12h6M9 16h6"></path></svg>',
    prices: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><path d="M20 13 11 22l-9-9V4h9l9 9Z"></path><circle cx="7" cy="9" r="1.5"></circle></svg>',
    clients: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><circle cx="9" cy="8" r="4"></circle><path d="M2.5 21a6.5 6.5 0 0 1 13 0M16 7a3 3 0 1 1 0 6M18 15a5 5 0 0 1 4 5"></path></svg>',
    agenda: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><rect x="3" y="5" width="18" height="16" rx="2"></rect><path d="M16 3v4M8 3v4M3 10h18"></path></svg>',
    models: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><path d="m12 3 8 4.5v9L12 21l-8-4.5v-9L12 3Z"></path><path d="m4 7.5 8 4.5 8-4.5M12 12v9"></path></svg>',
    cash: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><rect x="3" y="6" width="18" height="13" rx="2"></rect><path d="M7 10h10M7 15h4"></path><circle cx="17" cy="15" r="1.5"></circle></svg>',
    finance: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><path d="M4 19V9M10 19V5M16 19v-7M22 19H2"></path></svg>',
    purchase: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><path d="M3 4h2l2 11h10l2-7H7"></path><circle cx="9" cy="19" r="1.5"></circle><circle cx="17" cy="19" r="1.5"></circle><path d="M14 3v6M11 6h6"></path></svg>',
    shoppingList: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><path d="M8 5h13M8 12h13M8 19h13"></path><path d="m3 5 1 1 2-2M3 12l1 1 2-2M3 19l1 1 2-2"></path></svg>',
    history: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><path d="M3 12a9 9 0 1 0 3-6.7L3 8"></path><path d="M3 3v5h5M12 7v5l3 2"></path></svg>',
    users: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><circle cx="8" cy="8" r="3"></circle><circle cx="17" cy="9" r="2.5"></circle><path d="M2.5 20a5.5 5.5 0 0 1 11 0M14 20a4.5 4.5 0 0 1 8 0"></path></svg>',
    logout: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><path d="M10 5H5v14h5M14 8l4 4-4 4M8 12h10"></path></svg>'
};

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
        <div class="nav-menu__header ds-sidebar-header">
            <button
                id="sidebar-collapse-btn"
                class="ds-sidebar-menu-btn"
                type="button"
                aria-label="Contraer menú lateral"
                title="Contraer menú lateral"
                aria-expanded="true"
            >${MENU_ICON.menu}</button>

            <img src="assets/logo.png" alt="Dulce Sall" class="header__logo ds-sidebar-logo" style="height:40px;">

            <div class="nav-menu__brand-copy">
                <span class="nav-menu__title">Dulce Sall</span>
                <small class="nav-menu__user-name">${nombre}</small>
            </div>
        </div>
    `;

    if (p.mostrador || p.indicadores || p.recetas || p.stock || p.presupuestos || p.precios) {
        htmlMenu += `<div class="nav-category"><button class="nav-category-btn">Operación <span class="nav-icon">+</span></button><div class="nav-category-content">`;

        if (p.indicadores) htmlMenu += `<a href="index.html" class="nav-menu__link" title="Inicio"><span class="nav-menu__glyph">${MENU_ICON.home}</span><span class="nav-menu__label">Inicio</span></a>`;
        if (p.mostrador) htmlMenu += `<a href="pos.html" class="nav-menu__link" title="Mostrador"><span class="nav-menu__glyph">${MENU_ICON.pos}</span><span class="nav-menu__label">Mostrador</span></a>`;
        if (p.stock) htmlMenu += `<a href="stock.html" class="nav-menu__link" title="Stock"><span class="nav-menu__glyph">${MENU_ICON.stock}</span><span class="nav-menu__label">Stock</span></a>`;
        if (p.recetas) htmlMenu += `<a href="recetas.html" class="nav-menu__link" title="Productos y recetas"><span class="nav-menu__glyph">${MENU_ICON.recipes}</span><span class="nav-menu__label">Productos y recetas</span></a>`;
        if (p.presupuestos) htmlMenu += `<a href="presupuesto.html" class="nav-menu__link" title="Presupuestos"><span class="nav-menu__glyph">${MENU_ICON.quote}</span><span class="nav-menu__label">Presupuestos</span></a>`;
        if (p.precios) htmlMenu += `<a href="precios.html" class="nav-menu__link" title="Precios y revisión"><span class="nav-menu__glyph">${MENU_ICON.prices}</span><span class="nav-menu__label">Precios y revisión</span></a>`;

        htmlMenu += `</div></div>`;
    }

    if (p.clientes || p.agenda || p.modelos) {
        htmlMenu += `<div class="nav-category"><button class="nav-category-btn">Comercial <span class="nav-icon">+</span></button><div class="nav-category-content">`;

        if (p.clientes) htmlMenu += `<a href="clientes.html" class="nav-menu__link" title="Clientes"><span class="nav-menu__glyph">${MENU_ICON.clients}</span><span class="nav-menu__label">Clientes</span></a>`;
        if (p.agenda) htmlMenu += `<a href="agenda.html" class="nav-menu__link" title="Agenda y entregas"><span class="nav-menu__glyph">${MENU_ICON.agenda}</span><span class="nav-menu__label">Agenda y entregas</span></a>`;
        if (p.modelos) htmlMenu += `<a href="modelos.html" class="nav-menu__link" title="Modelos 3D"><span class="nav-menu__glyph">${MENU_ICON.models}</span><span class="nav-menu__label">Modelos 3D</span></a>`;

        htmlMenu += `</div></div>`;
    }

    if (p.cajas || p.finanzas || p.historial || p.compras || p.compras_lista || p.configuracion || userRol === 'master') {
        htmlMenu += `<div class="nav-category"><button class="nav-category-btn">Administración <span class="nav-icon">+</span></button><div class="nav-category-content">`;

        if (p.cajas) htmlMenu += `<a href="cajas.html" class="nav-menu__link" title="Cajas"><span class="nav-menu__glyph">${MENU_ICON.cash}</span><span class="nav-menu__label">Cajas</span></a>`;
        if (p.finanzas) htmlMenu += `<a href="finanzas.html" class="nav-menu__link" title="Finanzas"><span class="nav-menu__glyph">${MENU_ICON.finance}</span><span class="nav-menu__label">Finanzas</span></a>`;
        if (p.compras) htmlMenu += `<a href="compras.html" class="nav-menu__link" title="Registrar compra"><span class="nav-menu__glyph">${MENU_ICON.purchase}</span><span class="nav-menu__label">Registrar compra</span></a>`;
        if (p.compras_lista) htmlMenu += `<a href="compras-lista.html" class="nav-menu__link" title="Lista de compras"><span class="nav-menu__glyph">${MENU_ICON.shoppingList}</span><span class="nav-menu__label">Lista de compras</span></a>`;
        if (p.historial) htmlMenu += `<a href="historial.html" class="nav-menu__link" title="Historial"><span class="nav-menu__glyph">${MENU_ICON.history}</span><span class="nav-menu__label">Historial</span></a>`;
        if (p.configuracion || userRol === 'master') htmlMenu += `<a href="usuarios.html" class="nav-menu__link" title="Usuarios y permisos"><span class="nav-menu__glyph">${MENU_ICON.users}</span><span class="nav-menu__label">Usuarios y permisos</span></a>`;

        htmlMenu += `</div></div>`;
    }

    htmlMenu += `
        <div class="nav-menu__footer">
            <button id="btn-cerrar-sesion-menu" class="btn-secondary nav-menu__logout" title="Cerrar sesión">
                <span class="nav-menu__logout-icon">${MENU_ICON.logout}</span>
                <span class="nav-menu__logout-label">Cerrar sesión</span>
            </button>
        </div>
    `;

    navMenu.innerHTML = htmlMenu;

    const sidebarCollapseBtn = document.getElementById('sidebar-collapse-btn');
    const SIDEBAR_STORAGE_KEY = 'dsSidebarCollapsed';

    const aplicarEstadoSidebar = (collapsed, { persist = false } = {}) => {
        document.body.classList.toggle('ds-sidebar-collapsed', collapsed);

        if (sidebarCollapseBtn) {
            const label = collapsed ? 'Expandir menú lateral' : 'Contraer menú lateral';
            sidebarCollapseBtn.setAttribute('aria-label', label);
            sidebarCollapseBtn.title = label;
            sidebarCollapseBtn.setAttribute('aria-expanded', String(!collapsed));
        }

        if (persist) {
            localStorage.setItem(SIDEBAR_STORAGE_KEY, collapsed ? '1' : '0');
        }
    };

    aplicarEstadoSidebar(localStorage.getItem(SIDEBAR_STORAGE_KEY) === '1');

    if (sidebarCollapseBtn) {
        sidebarCollapseBtn.addEventListener('click', () => {
            if (window.innerWidth < 1024) {
                navMenu.classList.remove('active');
                document.body.classList.remove('menu-open');
                if (navOverlay) navOverlay.classList.remove('active');
                return;
            }

            aplicarEstadoSidebar(
                !document.body.classList.contains('ds-sidebar-collapsed'),
                { persist: true }
            );
        });
    }

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
            btnCerrarSesion.innerHTML = `<span class="nav-menu__logout-icon">${MENU_ICON.logout}</span><span class="nav-menu__logout-label">Cerrando…</span>`;

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
