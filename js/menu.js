document.addEventListener('DOMContentLoaded', () => {

    // ==========================================
    // 0. SISTEMA DE SEGURIDAD Y PERMISOS
    // ==========================================
    const permisosJSON = localStorage.getItem('userPermisos');
    let permisos = {};
    
    // Si no está logueado y no está en la página de login, lo echa.
    if (!permisosJSON && !window.location.href.includes('login.html')) {
        window.location.href = 'login.html';
        return;
    }

    if (permisosJSON) {
        try { permisos = JSON.parse(permisosJSON); } catch(e) {}
    }

    // Mapa: ¿Qué permiso se necesita para ver cada página?
    const rutaPermiso = {
        'pos.html': 'mostrador',
        'index.html': 'finanzas',
        'recetas.html': 'recetas',
        'stock.html': 'stock',
        'precios.html': 'recetas',
        'cajas.html': 'cajas',
        'finanzas.html': 'finanzas',
        'historial.html': 'mostrador',
        'compras.html': 'stock',
        'compras-lista.html': 'stock',
        'usuarios.html': 'configuracion',
        'clientes.html': 'mostrador',
        'agenda.html': 'mostrador',
        'modelos.html': 'mostrador'
    };

    if (!window.location.href.includes('login.html')) {
        
        // A. Ocultar los enlaces a los que el usuario no tiene permiso
        document.querySelectorAll('.nav-menu__link').forEach(link => {
            const href = link.getAttribute('href');
            let tienePermiso = false;
            
            // Regla especial: Presupuesto lo puede ver quien tenga Mostrador O Recetas
            if (href === 'presupuesto.html') {
                tienePermiso = permisos.mostrador || permisos.recetas;
            } else if (rutaPermiso[href]) {
                tienePermiso = permisos[rutaPermiso[href]];
            } else {
                tienePermiso = true; // Por defecto, si no está en la lista, lo muestra
            }

            if (!tienePermiso) {
                link.style.display = 'none'; // Lo ocultamos de la vista
            }
        });

        // B. Ocultar las categorías que se quedaron sin botones visibles
        document.querySelectorAll('.nav-category').forEach(cat => {
            // Buscamos cuántos enlaces quedaron visibles adentro de esta categoría
            const linksVisibles = Array.from(cat.querySelectorAll('.nav-menu__link')).filter(l => l.style.display !== 'none');
            if (linksVisibles.length === 0) {
                cat.style.display = 'none'; // Si no hay nada, ocultamos el título de la categoría
            }
        });

        // C. Mostrar el nombre del usuario y el botón de Cerrar Sesión
        const navMenu = document.getElementById('nav-menu');
        const userName = localStorage.getItem('userName') || 'Usuario';
        
        const titleEl = document.querySelector('.nav-menu__title');
        if (titleEl) {
            titleEl.innerHTML = `Dulce App<br><span style="font-size:0.8rem; color:#fbcfe8; font-weight:normal;">👤 ${userName}</span>`;
        }

        if (navMenu) {
            const logoutDiv = document.createElement('div');
            logoutDiv.style.padding = '1.5rem 1rem';
            logoutDiv.style.marginTop = '1rem';
            logoutDiv.innerHTML = `
                <button id="btn-logout" style="width: 100%; padding: 0.8rem; background: rgba(239, 68, 68, 0.2); border: 1px solid #ef4444; color: #fca5a5; border-radius: 8px; font-weight: bold; cursor: pointer; display: flex; justify-content: center; align-items: center; gap: 0.5rem; transition: background 0.2s;">
                    <span>🚪</span> Cerrar Sesión
                </button>
            `;
            navMenu.appendChild(logoutDiv);

            document.getElementById('btn-logout').addEventListener('click', () => {
                if(confirm('¿Estás seguro de que querés cerrar sesión?')) {
                    localStorage.clear();
                    window.location.href = 'login.html?logout=true';
                }
            });
        }
    }


    // ==========================================
    // 1. ABRIR Y CERRAR EL MENÚ LATERAL (TU CÓDIGO ORIGINAL INTACTO)
    // ==========================================
    const menuBtn = document.getElementById('menu-toggle-btn');
    const overlay = document.getElementById('nav-overlay');
    
    const toggleMenu = () => {
        document.body.classList.toggle('menu-open');
    };

    if (menuBtn) menuBtn.addEventListener('click', toggleMenu);
    if (overlay) overlay.addEventListener('click', toggleMenu);

    // ==========================================
    // 2. LÓGICA DE CATEGORÍAS DESPLEGABLES (ACORDEÓN)
    // ==========================================
    const categoryBtns = document.querySelectorAll('.nav-category-btn');
    
    categoryBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            const currentCategory = btn.parentElement;
            const isActive = currentCategory.classList.contains('active');
            
            // Cerrar todas las demás categorías para mantener ordenado
            document.querySelectorAll('.nav-category').forEach(cat => {
                cat.classList.remove('active');
            });
            
            // Si la que tocamos no estaba abierta, la abrimos
            if (!isActive) {
                currentCategory.classList.add('active');
            }
        });
    });

    // ==========================================
    // 3. AUTO-SELECCIONAR PÁGINA ACTUAL
    // ==========================================
    let currentPath = window.location.pathname.split('/').pop();
    if (currentPath === '') currentPath = 'index.html'; 

    const activeLink = document.querySelector(`.nav-menu__link[href="${currentPath}"]`);
    
    if (activeLink) {
        activeLink.classList.add('active');
        
        const parentCategory = activeLink.closest('.nav-category');
        if (parentCategory) {
            parentCategory.classList.add('active');
        }
    }
});
