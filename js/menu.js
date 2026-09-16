function inicializarMenu() {
    const navMenu = document.getElementById('nav-menu');
    const menuToggleBtn = document.getElementById('menu-toggle-btn') || document.getElementById('menu-toggle');
    const navOverlay = document.getElementById('nav-overlay') || document.getElementById('menu-overlay');

    // ==========================================
    // 1. LEER ROL Y LOS 15 PERMISOS EXACTOS
    // ==========================================
    const userRol = localStorage.getItem('userRol') || 'empleado';
    
    // Todos bloqueados por defecto para que sea 100% seguro
    let p = {
        mostrador: false, 
        indicadores: false, 
        recetas: false, 
        stock: false, 
        presupuestos: false, 
        precios: false, 
        cajas: false, 
        finanzas: false, 
        historial: false, 
        compras: false, 
        compras_lista: false, 
        clientes: false, 
        agenda: false, 
        modelos: false, 
        configuracion: false
    };

    if (userRol === 'master') {
        // El dueño tiene acceso absoluto a todo
        for(let key in p) p[key] = true;
    } else {
        // La empleada carga lo que el admin le tildó
        try {
            const guardados = JSON.parse(localStorage.getItem('userPermisos'));
            if (guardados) p = { ...p, ...guardados };
        } catch(e) {
            console.error("Error leyendo permisos locales", e);
        }
    }

    // ==========================================
    // 2. SEGURIDAD EXTREMA: PROTEGER RUTAS (EL "PATOVICA")
    // ==========================================
    const currentPath = window.location.pathname.split('/').pop() || 'index.html';
    
    // Diccionario estricto: ¿Qué permiso necesitás para ver cada HTML?
    const rutasProtegidas = {
        'pos.html': p.mostrador,
        'index.html': p.indicadores,
        'recetas.html': p.recetas,
        'stock.html': p.stock,
        'presupuesto.html': p.presupuestos,
        // Si tiene permiso de presupuesto o mostrador, puede ver el carrito
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
        // Configuración es solo para administradores o quienes tengan el permiso
        'usuarios.html': p.configuracion || userRol === 'master'
    };

    // ¿La empleada intentó entrar por URL a algo prohibido? ¡Afuera!
    // (A menos que esté en login.html, donde todos pueden estar)
    if (currentPath !== 'login.html' && rutasProtegidas[currentPath] === false) {
        alert("🔒 Acceso Denegado: Tu perfil no tiene permisos para ver esta pantalla.");
        
        // La redireccionamos a una pantalla segura que sí tenga permitida
        if (p.mostrador) window.location.href = 'pos.html';
        else if (p.stock) window.location.href = 'stock.html';
        else if (p.indicadores) window.location.href = 'index.html';
        else window.location.href = 'login.html'; // Si no tiene nada, la echamos a la calle
        return; // Detenemos todo el script acá para que no siga cargando la página prohibida
    }

    // Si el HTML no tiene la etiqueta de navegación, frenamos acá.
    if (!navMenu) return;

    // ==========================================
    // 3. DIBUJAR MENÚ DINÁMICO (Ocultar botones prohibidos)
    // ==========================================
    if (navMenu.innerHTML.trim() === '') {
        
        let htmlMenu = `
            <div class="nav-menu__header">
                <img src="assets/logo.png" alt="Logo" class="header__logo" style="height: 40px;" onerror="this.style.display='none'">
                <span class="nav-menu__title">Dulce App</span>
            </div>
        `;

        // CATEGORÍA 1: PANEL PRINCIPAL
        // Solo mostramos la categoría si tiene al menos UN permiso de estos
        if (p.mostrador || p.indicadores || p.recetas || p.stock || p.presupuestos || p.precios) {
            htmlMenu += `
            <div class="nav-category">
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

        // CATEGORÍA 2: GESTIÓN Y FINANZAS
        if (p.cajas || p.finanzas || p.historial || p.compras || p.compras_lista || p.configuracion || userRol === 'master') {
            htmlMenu += `
            <div class="nav-category">
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

        // CATEGORÍA 3: CLIENTES Y AGENDA
        if (p.clientes || p.agenda || p.modelos) {
            htmlMenu += `
            <div class="nav-category">
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
            </div>
        `;

        navMenu.innerHTML = htmlMenu;
    }

    // ==========================================
    // 4. FUNCIONES VISUALES DEL MENÚ (Desplegables)
    // ==========================================
    const togglearMenu = () => {
        navMenu.classList.toggle('active');
        document.body.classList.toggle('menu-open');
        if (navOverlay) navOverlay.classList.toggle('active');
    };

    if (menuToggleBtn) {
        // Clona el botón para matar eventos viejos que puedan chocar
        const nuevoBoton = menuToggleBtn.cloneNode(true);
        menuToggleBtn.parentNode.replaceChild(nuevoBoton, menuToggleBtn);
        nuevoBoton.addEventListener('click', (e) => { 
            e.preventDefault(); 
            togglearMenu(); 
        });
    }

    if (navOverlay) {
        navOverlay.addEventListener('click', () => {
            navMenu.classList.remove('active');
            document.body.classList.remove('menu-open');
            navOverlay.classList.remove('active');
        });
    }

    // Acordeón de categorías
    document.querySelectorAll('.nav-category-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const content = btn.nextElementSibling;
            const icon = btn.querySelector('.nav-icon');
            if (content.style.maxHeight) { 
                content.style.maxHeight = null; 
                icon.textContent = '+'; 
            } else { 
                content.style.maxHeight = content.scrollHeight + "px"; 
                icon.textContent = '-'; 
            }
        });
    });

    // Marcar la página actual de rosa en el menú y abrir su categoría automáticamente
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

    // ==========================================
    // 5. CERRAR SESIÓN
    // ==========================================
    const btnCerrarSesion = document.getElementById('btn-cerrar-sesion-menu');
    if (btnCerrarSesion) {
        btnCerrarSesion.addEventListener('click', () => {
            localStorage.clear();
            window.location.href = 'login.html';
        });
    }
}

// Asegurarse de que el HTML haya cargado antes de inyectar el menú
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', inicializarMenu);
} else {
    inicializarMenu();
}
