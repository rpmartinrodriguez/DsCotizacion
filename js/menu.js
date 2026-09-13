document.addEventListener("DOMContentLoaded", () => {
    const navMenu = document.getElementById('nav-menu');
    const menuToggleBtn = document.getElementById('menu-toggle-btn');
    const navOverlay = document.getElementById('nav-overlay');

    // 1. Leer los permisos del usuario activo
    const permisosJSON = localStorage.getItem('userPermisos');
    let permisos = {};
    
    // Si no hay permisos y no estamos en la página de login, lo echamos al login
    if (!permisosJSON && !window.location.href.includes('login.html')) {
        window.location.href = 'login.html';
        return;
    }

    if (permisosJSON) {
        try { permisos = JSON.parse(permisosJSON); } catch(e) {}
    }
    
    const userName = localStorage.getItem('userName') || 'Usuario';

    // 2. Construir el menú dinámico si el elemento existe
    if (navMenu && !window.location.href.includes('login.html')) {
        let menuHTML = `
            <div class="nav-menu__header" style="text-align: center; padding: 1.5rem 1rem; border-bottom: 1px solid rgba(255,255,255,0.1);">
                <img src="assets/logo.png" alt="Logo" class="header__logo" style="height: 60px; margin-bottom: 0.5rem; object-fit: contain;" onerror="this.style.display='none'">
                <span class="nav-menu__title" style="display: block; font-size: 1.2rem; color: white;">Dulce App</span>
                <span style="display: block; font-size: 0.85rem; color: #fbcfe8; margin-top: 0.3rem;">👤 ${userName}</span>
            </div>
        `;

        // CATEGORÍA 1: Panel Principal
        let linksPrincipal = '';
        if (permisos.mostrador) linksPrincipal += `<a href="pos.html" class="nav-menu__link"><span>🏪</span> Mostrador</a>`;
        if (permisos.finanzas)  linksPrincipal += `<a href="index.html" class="nav-menu__link"><span>📊</span> Indicadores</a>`;
        if (permisos.recetas)   linksPrincipal += `<a href="recetas.html" class="nav-menu__link"><span>🍰</span> Postres</a>`;
        if (permisos.stock)     linksPrincipal += `<a href="stock.html" class="nav-menu__link"><span>📦</span> Stock</a>`;
        if (permisos.mostrador || permisos.recetas) linksPrincipal += `<a href="presupuesto.html" class="nav-menu__link"><span>🧾</span> Presupuesto</a>`;
        if (permisos.recetas)   linksPrincipal += `<a href="precios.html" class="nav-menu__link"><span>💲</span> Lista de Precios</a>`;

        if (linksPrincipal !== '') {
            menuHTML += `
            <div class="nav-category active">
                <button class="nav-category-btn">Panel Principal <span class="nav-icon">-</span></button>
                <div class="nav-category-content" style="display: block;">
                    ${linksPrincipal}
                </div>
            </div>`;
        }

        // CATEGORÍA 2: Gestión y Finanzas
        let linksGestion = '';
        if (permisos.cajas) linksGestion += `<a href="cajas.html" class="nav-menu__link"><span>🗃️</span> Historial Cajas</a>`;
        if (permisos.finanzas) linksGestion += `<a href="finanzas.html" class="nav-menu__link"><span>💰</span> Finanzas</a>`;
        if (permisos.mostrador) linksGestion += `<a href="historial.html" class="nav-menu__link"><span>📚</span> Hist. Presupuestos</a>`;
        if (permisos.stock) linksGestion += `<a href="compras.html" class="nav-menu__link"><span>🛍️</span> Registrar Compra</a>`;
        if (permisos.stock) linksGestion += `<a href="compras-lista.html" class="nav-menu__link"><span>🛒</span> Lista de Compras</a>`;
        if (permisos.configuracion) linksGestion += `<a href="usuarios.html" class="nav-menu__link"><span>🛡️</span> Permisos y Usuarios</a>`;

        if (linksGestion !== '') {
            menuHTML += `
            <div class="nav-category active">
                <button class="nav-category-btn">Gestión y Finanzas <span class="nav-icon">-</span></button>
                <div class="nav-category-content" style="display: block;">
                    ${linksGestion}
                </div>
            </div>`;
        }

        // CATEGORÍA 3: Clientes y Agenda
        let linksClientes = '';
        if (permisos.mostrador) {
            linksClientes += `
                <a href="clientes.html" class="nav-menu__link"><span>👥</span> Clientes</a>
                <a href="agenda.html" class="nav-menu__link"><span>🗓️</span> Agenda</a>
                <a href="modelos.html" class="nav-menu__link"><span>🎨</span> Modelos 3D</a>
            `;
        }

        if (linksClientes !== '') {
            menuHTML += `
            <div class="nav-category active">
                <button class="nav-category-btn">Clientes y Agenda <span class="nav-icon">-</span></button>
                <div class="nav-category-content" style="display: block;">
                    ${linksClientes}
                </div>
            </div>`;
        }

        // BOTÓN DE CERRAR SESIÓN
        menuHTML += `
            <div style="padding: 1.5rem 1rem; margin-top: 1rem;">
                <button id="btn-logout" style="width: 100%; padding: 0.8rem; background: rgba(239, 68, 68, 0.2); border: 1px solid #ef4444; color: #fca5a5; border-radius: 8px; font-weight: bold; cursor: pointer; display: flex; justify-content: center; align-items: center; gap: 0.5rem; transition: all 0.3s;">
                    <span>🚪</span> Cerrar Sesión
                </button>
            </div>
        `;

        // Inyectar todo el menú limpio en el HTML
        navMenu.innerHTML = menuHTML;

        // Marcar el link activo según dónde estamos
        const currentPath = window.location.pathname.split('/').pop() || 'index.html';
        const allLinks = navMenu.querySelectorAll('.nav-menu__link');
        allLinks.forEach(link => {
            if (link.getAttribute('href') === currentPath) {
                link.classList.add('active');
            }
        });

        // Reasignar eventos a los acordeones
        const categoryBtns = navMenu.querySelectorAll('.nav-category-btn');
        categoryBtns.forEach(btn => {
            btn.addEventListener('click', () => {
                const category = btn.parentElement;
                const content = category.querySelector('.nav-category-content');
                const icon = btn.querySelector('.nav-icon');
                
                category.classList.toggle('active');
                if (category.classList.contains('active')) {
                    content.style.display = 'block';
                    icon.textContent = '-';
                } else {
                    content.style.display = 'none';
                    icon.textContent = '+';
                }
            });
        });

        // Evento para Cerrar Sesión
        const btnLogout = document.getElementById('btn-logout');
        if (btnLogout) {
            btnLogout.addEventListener('click', () => {
                if(confirm('¿Estás seguro de que querés cerrar sesión?')) {
                    localStorage.clear();
                    window.location.href = 'login.html?logout=true';
                }
            });
        }
    }

    // Lógica para abrir/cerrar el menú en celulares
    if (menuToggleBtn && navMenu && navOverlay) {
        menuToggleBtn.addEventListener('click', () => {
            navMenu.classList.add('active');
            navOverlay.classList.add('active');
        });

        navOverlay.addEventListener('click', () => {
            navMenu.classList.remove('active');
            navOverlay.classList.remove('active');
        });
    }
});
