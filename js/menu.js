function inicializarMenu() {
    // 1. CAPTURAR ELEMENTOS (Contemplando las variaciones de nombres en tus distintos HTML)
    const navMenu = document.getElementById('nav-menu');
    const menuToggleBtn = document.getElementById('menu-toggle-btn') || document.getElementById('menu-toggle');
    const navOverlay = document.getElementById('nav-overlay') || document.getElementById('menu-overlay');

    if (!navMenu) {
        console.error("No se encontró la etiqueta <nav id='nav-menu'> en el HTML.");
        return;
    }

    // 2. INYECTAR EL MENÚ SI ESTÁ VACÍO
    if (navMenu.innerHTML.trim() === '') {
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
                    <a href="presupuesto.html" class="nav-menu__link"><span>🧾</span> Presupuestos</a>
                    <a href="precios.html" class="nav-menu__link"><span>💲</span> Listas de Precios</a>
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

    // 3. FUNCIÓN PARA ABRIR/CERRAR EL MENÚ
    const togglearMenu = () => {
        // Le aplicamos la clase tanto al nav como al body para que el CSS funcione sea como sea que esté configurado
        navMenu.classList.toggle('active');
        document.body.classList.toggle('menu-open');
        if (navOverlay) navOverlay.classList.toggle('active');
    };

    // Aplicar evento al botón de las 3 rayitas
    if (menuToggleBtn) {
        // Remover eventos previos (por si el script se cargó dos veces)
        const nuevoBoton = menuToggleBtn.cloneNode(true);
        menuToggleBtn.parentNode.replaceChild(nuevoBoton, menuToggleBtn);
        
        nuevoBoton.addEventListener('click', (e) => {
            e.preventDefault();
            togglearMenu();
        });
    }

    // Aplicar evento al fondo oscuro para que cierre el menú al tocar afuera
    if (navOverlay) {
        navOverlay.addEventListener('click', () => {
            navMenu.classList.remove('active');
            document.body.classList.remove('menu-open');
            navOverlay.classList.remove('active');
        });
    }

    // 4. LÓGICA DEL ACORDEÓN (Desplegables)
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

    // 5. MARCAR PÁGINA ACTUAL EN EL MENÚ Y DESPLEGAR ACORDEÓN
    const currentPath = window.location.pathname.split('/').pop() || 'index.html';
    const links = document.querySelectorAll('.nav-menu__link');
    
    links.forEach(link => {
        const href = link.getAttribute('href');
        if (href && currentPath.includes(href.split('?')[0])) {
            link.classList.add('active');
            
            // Si la página está dentro de una categoría, la abrimos automáticamente
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

    // 6. CERRAR SESIÓN
    const btnCerrarSesion = document.getElementById('btn-cerrar-sesion-menu');
    if (btnCerrarSesion) {
        btnCerrarSesion.addEventListener('click', () => {
            localStorage.clear();
            window.location.href = 'login.html';
        });
    }
}

// Ejecutar el script asegurándonos de que el HTML ya haya cargado completamente
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', inicializarMenu);
} else {
    inicializarMenu();
}
