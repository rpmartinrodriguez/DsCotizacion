function inicializarMenu() {
    const navMenu = document.getElementById('nav-menu');
    const menuToggleBtn = document.getElementById('menu-toggle-btn') || document.getElementById('menu-toggle');
    const navOverlay = document.getElementById('nav-overlay') || document.getElementById('menu-overlay');

    const userRol = localStorage.getItem('userRol') || 'empleado';
    
    // Todos bloqueados por defecto
    let p = {
        mostrador: false, indicadores: false, recetas: false, stock: false, 
        presupuestos: false, precios: false, cajas: false, finanzas: false, 
        historial: false, compras: false, compras_lista: false, clientes: false, 
        agenda: false, modelos: false, configuracion: false
    };

    if (userRol === 'master') {
        for(let key in p) p[key] = true;
    } else {
        try {
            const guardados = JSON.parse(localStorage.getItem('userPermisos'));
            if (guardados) p = { ...p, ...guardados };
        } catch(e) {}
    }

    // ==========================================
    // EL PATOVICA: RUTAS BLOQUEADAS
    // ==========================================
    const currentPath = window.location.pathname.split('/').pop() || 'index.html';
    
    const rutasProtegidas = {
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

    // ¿Trató de entrar por URL a algo prohibido? ¡Afuera!
    if (rutasProtegidas[currentPath] === false) {
        alert("🔒 Acceso Denegado: Tu perfil no tiene permisos para ver esta pantalla.");
        if (p.mostrador) window.location.href = 'pos.html';
        else if (p.stock) window.location.href = 'stock.html';
        else window.location.href = 'login.html';
        return; 
    }

    if (!navMenu) return;

    // ==========================================
    // DIBUJAR MENÚ SEGÚN PERMISOS
    // ==========================================
    if (navMenu.innerHTML.trim() === '') {
        let htmlMenu = `
            <div class="nav-menu__header">
                <img src="assets/logo.png" alt="Logo" class="header__logo" style="height: 40px;" onerror="this.style.display='none'">
                <span class="nav-menu__title">Dulce App</span>
            </div>`;

        // 1. Panel Principal
        if (p.mostrador || p.indicadores || p.recetas || p.stock || p.presupuestos || p.precios) {
            htmlMenu += `<div class="nav-category">
                <button class="nav-category-btn">Panel Principal <span class="nav-icon">+</span></button>
                <div class="nav-category-content">
                    ${p.mostrador ? `<a href="pos.html" class="nav-menu__link"><span>🏪</span> Mostrador</a>` : ''}
                    ${p.indicadores ? `<a href="index.html" class="nav-menu__link"><span>📊</span> Indicadores</a>` : ''}
                    ${p.recetas ? `<a href="recetas.html" class="nav-menu__link"><span>🍰</span> Postres</a>` : ''}
                    ${p.stock ? `<a href="stock.html" class="nav-menu__link"><span>📦</span> Stock</a>` : ''}
                    ${p.presupuestos ? `<a href="presupuesto.html" class="nav-menu__link"><span>🧾</span> Presupuestos</a>` : ''}
                    ${p.precios ? `<a href="precios.html" class="nav-menu__link"><span>💲</span> Listas Precios</a>` : ''}
                </div>
            </div>`;
        }

        // 2. Gestión y Finanzas
        if (p.cajas || p.finanzas || p.historial || p.compras || p.compras_lista || p.configuracion || userRol === 'master') {
            htmlMenu += `<div class="nav-category">
                <button class="nav-category-btn">Gestión y Finanzas <span class="nav-icon">+</span></button>
                <div class="nav-category-content">
                    ${p.cajas ? `<a href="cajas.html" class="nav-menu__link"><span>🗃️</span> Historial Cajas</a>` : ''}
                    ${p.finanzas ? `<a href="finanzas.html" class="nav-menu__link"><span>💰</span> Finanzas</a>` : ''}
                    ${p.historial ? `<a href="historial.html" class="nav-menu__link"><span>📚</span> Historial Presupuestos</a>` : ''}
                    ${p.compras ? `<a href="compras.html" class="nav-menu__link"><span>🛍️</span> Registrar Compra</a>` : ''}
                    ${p.compras_lista ? `<a href="compras-lista.html" class="nav-menu__link"><span>🛒</span> Lista de Compras</a>` : ''}
                    ${p.configuracion || userRol === 'master' ? `<a href="usuarios.html" class="nav-menu__link"><span>🛡️</span> Permisos y Usuarios</a>` : ''}
                </div>
            </div>`;
        }

        // 3. Clientes y Agenda
        if (p.clientes || p.agenda || p.modelos) {
            htmlMenu += `<div class="nav-category">
                <button class="nav-category-btn">Clientes y Agenda <span class="nav-icon">+</span></button>
                <div class="nav-category-content">
                    ${p.clientes ? `<a href="clientes.html" class="nav-menu__link"><span>👥</span> Clientes</a>` : ''}
                    ${p.agenda ? `<a href="agenda.html" class="nav-menu__link"><span>🗓️</span> Agenda</a>` : ''}
                    ${p.modelos ? `<a href="modelos.html" class="nav-menu__link"><span>🎨</span> Modelos 3D</a>` : ''}
                </div>
            </div>`;
        }

        htmlMenu += `
            <div style="padding: 1rem; border-top: 1px solid #e2e8f0; margin-top: 1rem;">
                <button id="btn-cerrar-sesion-menu" class="btn-secondary" style="width: 100%; color: #dc2626; border-color: #fca5a5; background: #fef2f2;">Cerrar Sesión</button>
            </div>`;

        navMenu.innerHTML = htmlMenu;
    }

    // Funciones del Menú desplegable
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

if (document.readyState === 'loading') { document.addEventListener('DOMContentLoaded', inicializarMenu); } 
else { inicializarMenu(); }
