document.addEventListener('DOMContentLoaded', () => {
    const navMenu = document.getElementById('nav-menu');
    const menuToggleBtn = document.getElementById('menu-toggle-btn');
    const navOverlay = document.getElementById('nav-overlay');

    // ==========================================
    // 1. INYECCIÓN DINÁMICA DEL MENÚ
    // Si el HTML no tiene el menú escrito, lo inyectamos con JS
    // ==========================================
    if (navMenu && navMenu.innerHTML.trim() === '') {
        const userRol = localStorage.getItem('userRol') || 'empleado';
        
        navMenu.innerHTML = `
            <div class="nav-menu__header">
                <img src="assets/logo.png" alt="Logo" class="header__logo" style="height: 40px;" onerror="this.style.display='none'">
                <span class="nav-menu__title">Dulce App</span>
            </div>

            <div class="nav-category">
                <button class="nav-category-btn">Panel Principal <span class="nav-icon">+</span></button>
                <div class="nav-category-content">
                    <a href="pos.html" class="nav-menu__link"><span>🏪</span> Mostrador</a>
                    <a href="index.html" class="nav-menu__link"><span>📊</span> Indicadores</a>
                    <a href="recetas.html" class="nav-menu__link"><span>🍰</span> Postres</a>
                    <a href="stock.html" class="nav-menu__link"><span>📦</span> Stock</a>
                    <a href="presupuesto.html" class="nav-menu__link"><span>🧾</span> Presupuesto</a>
                    <a href="precios.html" class="nav-menu__link"><span>💲</span> Lista de Precios</a>
                </div>
            </div>

            <div class="nav-category">
                <button class="nav-category-btn">Gestión y Finanzas <span class="nav-icon">+</span></button>
                <div class="nav-category-content">
                    <a href="cajas.html" class="nav-menu__link"><span>🗃️</span> Historial Cajas</a>
                    <a href="finanzas.html" class="nav-menu__link"><span>💰</span> Finanzas</a>
                    <a href="historial.html" class="nav-menu__link"><span>📚</span> Historial Presupuestos</a>
                    <a href="compras.html" class="nav-menu__link"><span>🛍️</span> Registrar Compra</a>
                    <a href="compras-lista.html" class="nav-menu__link"><span>🛒</span> Lista de Compras</a>
                    ${userRol === 'master' ? `<a href="usuarios.html" class="nav-menu__link"><span>🛡️</span> Permisos y Usuarios</a>` : ''}
                </div>
            </div>

            <div class="nav-category">
                <button class="nav-category-btn">Clientes y Agenda <span class="nav-icon">+</span></button>
                <div class="nav-category-content">
                    <a href="clientes.html" class="nav-menu__link"><span>👥</span> Clientes</a>
                    <a href="agenda.html" class="nav-menu__link"><span>🗓️</span> Agenda</a>
                    <a href="modelos.html" class="nav-menu__link"><span>🎨</span> Modelos 3D</a>
                </div>
            </div>

            <div style="padding: 1rem; border-top: 1px solid #e2e8f0; margin-top: 1rem;">
                <button id="btn-cerrar-sesion-menu" class="btn-secondary" style="width: 100%; color: #dc2626; border-color: #fca5a5; background: #fef2f2;">Cerrar Sesión</button>
            </div>
        `;
    }

    // ==========================================
    // 2. LÓGICA DE ABRIR/CERRAR EL MENÚ LATERAL
    // ==========================================
    if (menuToggleBtn) {
        menuToggleBtn.addEventListener('click', () => {
            navMenu.classList.toggle('active');
            if (navOverlay) navOverlay.classList.toggle('active');
        });
    }

    if (navOverlay) {
        navOverlay.addEventListener('click', () => {
            navMenu.classList.remove('active');
            navOverlay.classList.remove('active');
        });
    }

    // ==========================================
    // 3. LÓGICA DEL ACORDEÓN (Desplegables)
    // ==========================================
    const categoryBtns = document.querySelectorAll('.nav-category-btn');
    categoryBtns.forEach(btn => {
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

    // ==========================================
    // 4. MARCAR PÁGINA ACTUAL Y ABRIR SU ACORDEÓN
    // ==========================================
    const currentPath = window.location.pathname.split('/').pop() || 'index.html';
    const links = document.querySelectorAll('.nav-menu__link');
    
    links.forEach(link => {
        const href = link.getAttribute('href');
        // Usamos includes() por si el href tiene parámetros como ?v=1
        if (href && currentPath.includes(href.split('?')[0])) {
            link.classList.add('active');
            
            // Desplegamos automáticamente la categoría donde estamos parados
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
});
