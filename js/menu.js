document.addEventListener('DOMContentLoaded', () => {

    // ==========================================
    // 0. SEGURIDAD DE HIERRO (BLANCO O NEGRO)
    // ==========================================
    const userRol = localStorage.getItem('userRol'); // Lee si es 'master' o 'empleado'
    const userName = localStorage.getItem('userName') || 'Usuario';
    
    // Si no está logueado y no está en la página de login, lo echa a patadas.
    if (!userRol && !window.location.href.includes('login.html')) {
        window.location.href = 'login.html';
        return;
    }

    // Obtenemos la página exacta en la que está parado el usuario
    let currentPath = window.location.pathname.split('/').pop();
    if (currentPath === '' || currentPath === '/') currentPath = 'index.html'; 

    if (!window.location.href.includes('login.html')) {
        
        // --- 1. EXPULSIÓN INMEDIATA ---
        // Si NO es master, SOLO puede estar en pos.html
        if (userRol !== 'master') {
            if (currentPath !== 'pos.html') {
                alert("Acceso denegado: Tu perfil de empleado solo tiene acceso a la Caja.");
                window.location.href = 'pos.html'; // Lo mandamos a la caja directo
                return; // Corta la ejecución de todo lo demás
            }
        }

        // --- 2. DESTRUCCIÓN VISUAL DE BOTONES PROHIBIDOS ---
        document.querySelectorAll('.nav-menu__link').forEach(link => {
            const hrefOriginal = link.getAttribute('href');
            if (!hrefOriginal) return;

            const hrefLimpiado = hrefOriginal.split('/').pop(); 
            
            // Si es empleado, ocultamos CUALQUIER botón que no sea el Mostrador
            if (userRol !== 'master' && hrefLimpiado !== 'pos.html') {
                link.style.display = 'none';
            }
        });

        // --- 3. OCULTAR CATEGORÍAS VACÍAS ---
        document.querySelectorAll('.nav-category').forEach(cat => {
            const linksVisibles = Array.from(cat.querySelectorAll('.nav-menu__link')).filter(l => l.style.display !== 'none');
            if (linksVisibles.length === 0) {
                cat.style.display = 'none'; // Desaparece la categoría entera (Ej: "Gestión y Finanzas")
            }
        });

        // --- 4. MOSTRAR NOMBRE, ROL Y BOTÓN DE CERRAR SESIÓN ---
        const navMenu = document.getElementById('nav-menu');
        
        const titleEl = document.querySelector('.nav-menu__title');
        if (titleEl) {
            const etiquetaRol = userRol === 'master' ? '👑 Admin' : '👤 Caja';
            titleEl.innerHTML = `Dulce App<br><span style="font-size:0.8rem; color:#fbcfe8; font-weight:normal;">${userName} (${etiquetaRol})</span>`;
        }

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
