function inicializarMenu() {
    const navMenu = document.getElementById('nav-menu');
    const menuToggleBtn = document.getElementById('menu-toggle-btn') || document.getElementById('menu-toggle');
    const navOverlay = document.getElementById('nav-overlay') || document.getElementById('menu-overlay');

    // ==========================================
    // 1. LEER ROL Y PERMISOS DEL USUARIO
    // ==========================================
    const userRol = localStorage.getItem('userRol') || 'empleado';
    
    // Permisos por defecto (todo bloqueado)
    let permisos = {
        mostrador: false, stock: false, recetas: false,
        cajas: false, finanzas: false, configuracion: false
    };

    if (userRol === 'master') {
        // Si es el dueño, habilitamos todo a la fuerza
        for(let key in permisos) permisos[key] = true;
    } else {
        // Si es empleado, leemos qué le tildó el admin
        try {
            const guardados = JSON.parse(localStorage.getItem('userPermisos'));
            if (guardados) permisos = { ...permisos, ...guardados };
        } catch(e) { console.error("Error leyendo permisos", e); }
    }

    // ==========================================
    // 2. SEGURIDAD EXTREMA: PROTEGER RUTAS
    // ==========================================
    const currentPath = window.location.pathname.split('/').pop() || 'index.html';
    
    // Diccionario de qué permiso se necesita para cada pantalla
    const rutasProtegidas = {
        'pos.html': permisos.mostrador,
        'agenda.html': permisos.mostrador,
        'clientes.html': permisos.mostrador,
        'cotizacion-actual.html': permisos.mostrador,
        'stock.html': permisos.stock,
        'compras.html': permisos.stock,
        'compras-lista.html': permisos.stock,
        'recetas.html': permisos.recetas,
        'precios.html': permisos.recetas,
        'cajas.html': permisos.cajas,
        'index.html': permisos.finanzas, // Dashboard principal
        'finanzas.html': permisos.finanzas,
        'presupuesto.html': permisos.mostrador || permisos.finanzas,
        'historial.html': permisos.finanzas || permisos.mostrador,
        'usuarios.html': permisos.configuracion || userRol === 'master',
        'modelos.html': permisos.mostrador || permisos.recetas
    };

    // Si la ruta actual está en la lista negra para este usuario, lo echamos.
    if (rutasProtegidas[currentPath] === false) {
        alert("🔒 Acceso Denegado: No tenés permisos para ver esta sección.");
        // Lo mandamos a la pantalla que sí tenga permitida
        if (permisos.mostrador) window.location.href = 'pos.html';
        else if (permisos.stock) window.location.href = 'stock.html';
        else window.location.href = 'login.html';
        return; // Detenemos todo el script acá
    }

    if (!navMenu) return;

    // ==========================================
    // 3. INYECTAR EL MENÚ DINÁMICO FILTRADO
    // ==========================================
    if (navMenu.innerHTML.trim() === '') {
        
        let htmlMenu = `
            <div class="nav-menu__header">
                <img src="assets/logo.png" alt="Logo" class="header__logo" style="height: 40px;" onerror="this.style.display='none'">
                <span class="nav-menu__title">Dulce App</span>
            </div>
        `;

        // CATEGORÍA 1: PANEL PRINCIPAL
        if (permisos.mostrador || permisos.finanzas || permisos.recetas || permisos.stock) {
            htmlMenu += `
            <div class="nav-category">
                <button class="nav-category-btn">Panel Principal <span class="nav-icon">+</span></button>
                <div class="nav-category-content">
                    ${permisos.mostrador ? `<a href="pos.html" class="nav-menu__link"><span>🏪</span> Mostrador</a>` : ''}
                    ${permisos.finanzas ? `<a href="index.html" class="nav-menu__link"><span>📊</span> Indicadores</a>` : ''}
                    ${permisos.recetas ? `<a href="recetas.html" class="nav-menu__link"><span>🍰</span> Postres</a>` : ''}
                    ${permisos.stock ? `<a href="stock.html" class="nav-menu__link"><span>📦</span> Stock</a>` : ''}
                    ${permisos.mostrador || permisos.finanzas ? `<a href="presupuesto.html" class="nav-menu__link"><span>🧾</span> Presupuestos</a>` : ''}
                    ${permisos.recetas ? `<a href="precios.html" class="nav-menu__link"><span>💲</span> Listas de Precios</a>` : ''}
                </div>
            </div>`;
        }

        // CATEGORÍA 2: GESTIÓN Y FINANZAS
        if (permisos.cajas || permisos.finanzas || permisos.stock || permisos.configuracion || userRol === 'master') {
            htmlMenu += `
            <div class="nav-category">
                <button class="nav-category-btn">Gestión y Finanzas <span class="nav-icon">+</span></button>
                <div class="nav-category-content">
                    ${permisos.cajas ? `<a href="cajas.html" class="nav-menu__link"><span>🗃️</span> Historial Cajas</a>` : ''}
                    ${permisos.finanzas ? `<a href="finanzas.html" class="nav-menu__link"><span>💰</span> Finanzas</a>` : ''}
                    ${permisos.finanzas || permisos.mostrador ? `<a href="historial.html" class="nav-menu__link"><span>📚</span> Historial Presupuestos</a>` : ''}
                    ${permisos.stock ? `<a href="compras.html" class="nav-menu__link"><span>🛍️</span> Registrar Compra</a>
                                        <a href="compras-lista.html" class="nav-menu__link"><span>🛒</span> Lista de Compras</a>` : ''}
                    ${permisos.configuracion || userRol === 'master' ? `<a href="usuarios.html" class="nav-menu__link"><span>🛡️</span> Permisos y Usuarios</a>` : ''}
                </div>
            </div>`;
        }

        // CATEGORÍA 3: CLIENTES Y AGENDA
        if (permisos.mostrador || permisos.finanzas) {
            htmlMenu += `
            <div class="nav-category">
                <button class="nav-category-btn">Clientes y Agenda <span class="nav-icon">+</span></button>
                <div class="nav-category-content">
                    <a href="clientes.html" class="nav-menu__link"><span>👥</span> Clientes</a>
                    <a href="agenda.html" class="nav-menu__link"><span>🗓️</span> Agenda</a>
                    <a href="modelos.html" class="nav-menu__link"><span>🎨</span> Modelos 3D</a>
                </div>
            </div>`;
        }

        htmlMenu += `
            <div style="padding: 1rem; border-top: 1px solid #e2e8f0; margin-top: 1rem;">
                <button id="btn-cerrar-sesion-menu" class="btn-secondary" style="width: 100%; color: #dc2626; border-color: #fca5a5; background: #fef2f2;">Cerrar Sesión</button>
            </div>
        `;

        navMenu.innerHTML = htmlMenu;
    }

    // ==========================================
    // 4. LÓGICA DE ABRIR/CERRAR MENÚ Y ACORDEÓN
    // ==========================================
    const togglearMenu = () => {
        navMenu.classList.toggle('active');
        document.body.classList.toggle('menu-open');
        if (navOverlay) navOverlay.classList.toggle('active');
    };

    if (menuToggleBtn) {
        const nuevoBoton = menuToggleBtn.cloneNode(true);
        menuToggleBtn.parentNode.replaceChild(nuevoBoton, menuToggleBtn);
        nuevoBoton.addEventListener('click', (e) => { e.preventDefault(); togglearMenu(); });
    }

    if (navOverlay) {
        navOverlay.addEventListener('click', () => {
            navMenu.classList.remove('active');
            document.body.classList.remove('menu-open');
            navOverlay.classList.remove('active');
        });
    }

    document.querySelectorAll('.nav-category-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const content = btn.nextElementSibling;
            const icon = btn.querySelector('.nav-icon');
            if (content.style.maxHeight) { content.style.maxHeight = null; icon.textContent = '+'; } 
            else { content.style.maxHeight = content.scrollHeight + "px"; icon.textContent = '-'; }
        });
    });

    const links = document.querySelectorAll('.nav-menu__link');
    links.forEach(link => {
        const href = link.getAttribute('href');
        if (href && currentPath.includes(href.split('?')[0])) {
            link.classList.add('active');
            const parentContent = link.closest('.nav-category-content');
            if (parentContent) {
                parentContent.style.maxHeight = parentContent.scrollHeight + "px";
                const parentBtn = parentContent.previousElementSibling;
                if (parentBtn) {
                    const icon = parentBtn.querySelector('.nav-icon');
                    if (icon) icon.textContent = '-';
                }
            }
        }
    });

    const btnCerrarSesion = document.getElementById('btn-cerrar-sesion-menu');
    if (btnCerrarSesion) {
        btnCerrarSesion.addEventListener('click', () => {
            localStorage.clear();
            window.location.href = 'login.html';
        });
    }
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', inicializarMenu);
} else {
    inicializarMenu();
}
