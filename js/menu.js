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

    // Mapa Estricto: ¿Qué permiso se necesita para ver cada página?
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

    // Obtenemos la página exacta en la que está parado el usuario
    let currentPath = window.location.pathname.split('/').pop();
    if (currentPath === '' || currentPath === '/') currentPath = 'index.html'; 

    if (!window.location.href.includes('login.html')) {
        
        // --- 1. EXPULSIÓN DE SEGURIDAD ACTIVA ---
        // Si intenta entrar a una URL que no tiene permitida, lo pateamos.
        let tienePermisoPagina = false;
        
        if (currentPath === 'presupuesto.html') {
            tienePermisoPagina = permisos.mostrador || permisos.recetas;
        } else if (rutaPermiso[currentPath]) {
            tienePermisoPagina = permisos[rutaPermiso[currentPath]] === true;
        } else {
            tienePermisoPagina = true; // Por defecto a páginas sin restricción
        }

        if (!tienePermisoPagina) {
            alert("Acceso denegado: No tenés permiso de Administrador para ver esta sección.");
            window.location.href = 'pos.html'; // Lo mandamos a la caja directo
            return;
        }

        // --- 2. OCULTAR BOTONES DEL MENÚ ---
        document.querySelectorAll('.nav-menu__link').forEach(link => {
            const hrefOriginal = link.getAttribute('href');
            if (!hrefOriginal) return;

            // Limpiamos el link (le sacamos el ./ o rutas raras) para comparar exacto
            const hrefLimpiado = hrefOriginal.split('/').pop(); 
            
            let tienePermisoBtn = false;
            
            if (hrefLimpiado === 'presupuesto.html') {
                tienePermisoBtn = permisos.mostrador || permisos.recetas;
            } else if (rutaPermiso[hrefLimpiado]) {
                tienePermisoBtn = permisos[rutaPermiso[hrefLimpiado]] === true;
            } else {
                tienePermisoBtn = true;
            }

            if (!tienePermisoBtn) {
                link.style.display = 'none'; // Chau botón
            }
        });

        // --- 3. OCULTAR CATEGORÍAS VACÍAS ---
        document.querySelectorAll('.nav-category').forEach(cat => {
            const linksVisibles = Array.from(cat.querySelectorAll('.nav-menu__link')).filter(l => l.style.display !== 'none');
            if (linksVisibles.length === 0) {
                cat.style.display = 'none'; // Si no le quedó ni un botón, ocultamos el título (Ej: Gestión y Finanzas)
            }
        });

        // --- 4. MOSTRAR NOMBRE Y BOTÓN DE CERRAR SESIÓN ---
        const navMenu = document.getElementById('nav-menu');
        const userName = localStorage.getItem('userName') || 'Usuario';
        
        const titleEl = document.querySelector('.nav-menu__title');
        if (titleEl) {
            titleEl.innerHTML = `Dulce App<br><span style="font-size:0.8rem; color:#fbcfe8; font-weight:normal;">👤 ${userName}</span>`;
        }

        // Evitar duplicar el botón de logout
        if (navMenu && !document.getElementById('btn-logout')) {
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
    // 1. ABRIR Y CERRAR EL MENÚ LATERAL (TU CÓDIGO INTACTO)
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
            
            document.querySelectorAll('.nav-category').forEach(cat => {
                cat.classList.remove('active');
            });
            
            if (!isActive) {
                currentCategory.classList.add('active');
            }
        });
    });

    // ==========================================
    // 3. AUTO-SELECCIONAR PÁGINA ACTUAL
    // ==========================================
    const activeLink = document.querySelector(`.nav-menu__link[href="${currentPath}"]`) || document.querySelector(`.nav-menu__link[href="./${currentPath}"]`);
    
    if (activeLink) {
        activeLink.classList.add('active');
        const parentCategory = activeLink.closest('.nav-category');
        if (parentCategory) {
            parentCategory.classList.add('active');
        }
    }
});
