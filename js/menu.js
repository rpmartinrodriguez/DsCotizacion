document.addEventListener("DOMContentLoaded", () => {
    const navMenu = document.getElementById('nav-menu');
    
    // 1. Leer permisos
    const permisosJSON = localStorage.getItem('userPermisos');
    let permisos = {};
    
    if (!permisosJSON && !window.location.href.includes('login.html')) {
        window.location.href = 'login.html';
        return;
    }

    if (permisosJSON) {
        try { permisos = JSON.parse(permisosJSON); } catch(e) {}
    }
    
    const userName = localStorage.getItem('userName') || 'Usuario';

    // 2. Construir menú dinámicamente SIN forzar el "display: block"
    if (navMenu && !window.location.href.includes('login.html')) {
        let menuHTML = `
            <div class="nav-menu__header" style="text-align: center; padding: 1.5rem 1rem; border-bottom: 1px solid rgba(255,255,255,0.1);">
                <img src="assets/logo.png" alt="Logo" class="header__logo" style="height: 60px; margin-bottom: 0.5rem; object-fit: contain;" onerror="this.style.display='none'">
                <span class="nav-menu__title" style="display: block; font-size: 1.2rem; color: white;">Dulce App</span>
                <span style="display: block; font-size: 0.85rem; color: #fbcfe8; margin-top: 0.3rem;">👤 ${userName}</span>
            </div>
        `;

        // CATEGORÍA 1
        let linksPrincipal = '';
        if (permisos.mostrador) linksPrincipal += `<a href="pos.html" class="nav-menu__link"><span>🏪</span> Mostrador</a>`;
        if (permisos.finanzas)  linksPrincipal += `<a href="index.html" class="nav-menu__link"><span>📊</span> Indicadores</a>`;
        if (permisos.recetas)   linksPrincipal += `<a href="recetas.html" class="nav-menu__link"><span>🍰</span> Postres</a>`;
        if (permisos.stock)     linksPrincipal += `<a href="stock.html" class="nav-menu__link"><span>📦</span> Stock</a>`;
        if (permisos.mostrador || permisos.recetas) linksPrincipal += `<a href="presupuesto.html" class="nav-menu__link"><span>🧾</span> Presupuesto</a>`;
        if (permisos.recetas)   linksPrincipal += `<a href="precios.html" class="nav-menu__link"><span>💲</span> Lista de Precios</a>`;

        if (linksPrincipal !== '') {
            menuHTML += `
            <div class="nav-category">
                <button class="nav-category-btn">Panel Principal <span class="nav-icon">+</span></button>
                <div class="nav-category-content">
                    ${linksPrincipal}
                </div>
            </div>`;
        }

        // CATEGORÍA 2
        let linksGestion = '';
        if (permisos.cajas) linksGestion += `<a href="cajas.html" class="nav-menu__link"><span>🗃️</span> Historial Cajas</a>`;
        if (permisos.finanzas) linksGestion += `<a href="finanzas.html" class="nav-menu__link"><span>💰</span> Finanzas</a>`;
        if (permisos.mostrador) linksGestion += `<a href="historial.html" class="nav-menu__link"><span>📚</span> Hist. Presupuestos</a>`;
        if (permisos.stock) linksGestion += `<a href="compras.html" class="nav-menu__link"><span>🛍️</span> Registrar Compra</a>`;
        if (permisos.stock) linksGestion += `<a href="compras-lista.html" class="nav-menu__link"><span>🛒</span> Lista de Compras</a>`;
        if (permisos.configuracion) linksGestion += `<a href="usuarios.html" class="nav-menu__link"><span>🛡️</span> Permisos y Usuarios</a>`;

        if (linksGestion !== '') {
            menuHTML += `
            <div class="nav-category">
                <button class="nav-category-btn">Gestión y Finanzas <span class="nav-icon">+</span></button>
                <div class="nav-category-content">
                    ${linksGestion}
                </div>
            </div>`;
        }

        // CATEGORÍA 3
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
            <div class="nav-category">
                <button class="nav-category-btn">Clientes y Agenda <span class="nav-icon">+</span></button>
                <div class="nav-category-content">
                    ${linksClientes}
                </div>
            </div>`;
        }

        // BOTÓN CERRAR SESIÓN
        menuHTML += `
            <div style="padding: 1.5rem 1rem; margin-top: 1rem;">
                <button id="btn-logout" style="width: 100%; padding: 0.8rem; background: rgba(239, 68, 68, 0.2); border: 1px solid #ef4444; color: #fca5a5; border-radius: 8px; font-weight: bold; cursor: pointer; display: flex; justify-content: center; align-items: center; gap: 0.5rem; transition: all 0.3s;">
                    <span>🚪</span> Cerrar Sesión
                </button>
            </div>
        `;

        navMenu.innerHTML = menuHTML;

        // Auto-desplegar la pestaña donde el usuario está parado
        const currentPath = window.location.pathname.split('/').pop() || 'index.html';
        const allLinks = navMenu.querySelectorAll('.nav-menu__link');
        
        allLinks.forEach(link => {
            if (link.getAttribute('href') === currentPath) {
                link.classList.add('active');
                
                // Abre el acordeón padre
                const parentCategory = link.closest('.nav-category');
                if (parentCategory) {
                    parentCategory.classList.add('active');
                    const icon = parentCategory.querySelector('.nav-icon');
                    if (icon) icon.textContent = '-';
                    const content = parentCategory.querySelector('.nav-category-content');
                    if (content) content.style.display = 'block';
                }
            }
        });
    }
});

// 3. EVENTOS (Botones, Overlay y Acordeones) blindados a nivel documento
document.addEventListener('click', (e) => {
    
    // A. Botón tres rayitas (Menú Celular)
    if (e.target.closest('#menu-toggle-btn')) {
        const navMenu = document.getElementById('nav-menu');
        const navOverlay = document.getElementById('nav-overlay');
        if (navMenu) navMenu.classList.add('active');
        if (navOverlay) navOverlay.classList.add('active');
        return;
    }

    // B. Tocar fondo oscuro para cerrar menú
    if (e.target.closest('#nav-overlay')) {
        const navMenu = document.getElementById('nav-menu');
        const navOverlay = document.getElementById('nav-overlay');
        if (navMenu) navMenu.classList.remove('active');
        if (navOverlay) navOverlay.classList.remove('active');
        return;
    }

    // C. Abrir/Cerrar las categorías del menú (El acordeón)
    const catBtn = e.target.closest('.nav-category-btn');
    if (catBtn) {
        const category = catBtn.parentElement;
        const content = category.querySelector('.nav-category-content');
        const icon = catBtn.querySelector('.nav-icon');
        
        category.classList.toggle('active');
        if (category.classList.contains('active')) {
            if (content) content.style.display = 'block';
            if (icon) icon.textContent = '-';
        } else {
            if (content) content.style.display = 'none';
            if (icon) icon.textContent = '+';
        }
        return;
    }

    // D. Botón de Cerrar Sesión
    const btnLogout = e.target.closest('#btn-logout');
    if (btnLogout) {
        if(confirm('¿Estás seguro de que querés cerrar sesión?')) {
            localStorage.clear();
            window.location.href = 'login.html?logout=true';
        }
        return;
    }
});
