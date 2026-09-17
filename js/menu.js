function inicializarMenu() {
    const navMenu = document.getElementById('nav-menu');
    const menuToggleBtn = document.getElementById('menu-toggle-btn') || document.getElementById('menu-toggle');
    const navOverlay = document.getElementById('nav-overlay') || document.getElementById('menu-overlay');

    // ==========================================
    // 1. LEER LOS PERMISOS GUARDADOS EN EL CELULAR
    // ==========================================
    const userRol = localStorage.getItem('userRol') || 'empleado';
    let p = {};

    if (userRol === 'master') {
        // Si es el dueño, todo en true
        p = {
            mostrador: true, indicadores: true, recetas: true, stock: true, 
            presupuestos: true, precios: true, cajas: true, finanzas: true, 
            historial: true, compras: true, compras_lista: true, clientes: true, 
            agenda: true, modelos: true, configuracion: true
        };
    } else {
        // Si es empleada, lee exactamente los true/false que le tildaste en la base
        try {
            p = JSON.parse(localStorage.getItem('userPermisos')) || {};
        } catch(e) {
            p = {};
        }
    }

    // ==========================================
    // 2. BLOQUEO EXACTO Y SIMPLE
    // ==========================================
    // Sacamos el nombre del archivo limpio (ej: "stock.html")
    let archivoActual = window.location.pathname.split('/').pop().split('?')[0].split('#')[0];
    if (archivoActual === '' || archivoActual === '/') archivoActual = 'index.html';

    // Lista exacta de qué permiso habilita cada archivo
    const accesos = {
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

    // Si el archivo está en la lista y su permiso es FALSE, LO ECHAMOS INMEDIATAMENTE
    if (archivoActual !== 'login.html' && accesos[archivoActual] === false) {
        alert("Acceso denegado: No tenés permiso para ver esta sección.");
        if (p.mostrador) window.location.href = 'pos.html';
        else if (p.stock) window.location.href = 'stock.html';
        else window.location.href = 'login.html';
        return; // Frena el código para que no cargue la página
    }

    if (!navMenu) return;

    // ==========================================
    // 3. DIBUJAR MENÚ (SÓLO LO TILDADO)
    // ==========================================
    let htmlMenu = `
        <div class="nav-menu__header">
            <img src="assets/logo.png" alt="Logo" class="header__logo" style="height: 40px;">
            <span class="nav-menu__title">Dulce App</span>
        </div>
    `;

    // --- PANEL PRINCIPAL ---
    if (p.mostrador || p.indicadores || p.recetas || p.stock || p.presupuestos || p.precios) {
        htmlMenu += `<div class="nav-category"><button class="nav-category-btn">Panel Principal <span class="nav-icon">+</span></button><div class="nav-category-content">`;
        
        if (p.mostrador) htmlMenu += `<a href="pos.html" class="nav-menu__link"><span>🏪</span> Mostrador</a>`;
        if (p.indicadores) htmlMenu += `<a href="index.html" class="nav-menu__link"><span>📊</span> Indicadores</a>`;
        if (p.recetas) htmlMenu += `<a href="recetas.html" class="nav-menu__link"><span>🍰</span> Postres</a>`;
        if (p.stock) htmlMenu += `<a href="stock.html" class="nav-menu__link"><span>📦</span> Stock</a>`;
        if (p.presupuestos) htmlMenu += `<a href="presupuesto.html" class="nav-menu__link"><span>🧾</span> Presupuestos</a>`;
        if (p.precios) htmlMenu += `<a href="precios.html" class="nav-menu__link"><span>💲</span> Listas Precios</a>`;
        
        htmlMenu += `</div></div>`;
    }

    // --- GESTIÓN Y FINANZAS ---
    if (p.cajas || p.finanzas || p.historial || p.compras || p.compras_lista || p.configuracion || userRol === 'master') {
        htmlMenu += `<div class="nav-category"><button class="nav-category-btn">Gestión y Finanzas <span class="nav-icon">+</span></button><div class="nav-category-content">`;
        
        if (p.cajas) htmlMenu += `<a href="cajas.html" class="nav-menu__link"><span>🗃️</span> Historial Cajas</a>`;
        if (p.finanzas) htmlMenu += `<a href="finanzas.html" class="nav-menu__link"><span>💰</span> Finanzas</a>`;
        if (p.historial) htmlMenu += `<a href="historial.html" class="nav-menu__link"><span>📚</span> Historial Presupuestos</a>`;
        if (p.compras) htmlMenu += `<a href="compras.html" class="nav-menu__link"><span>🛍️</span> Registrar Compra</a>`;
        if (p.compras_lista) htmlMenu += `<a href="compras-lista.html" class="nav-menu__link"><span>🛒</span> Lista de Compras</a>`;
        if (p.configuracion || userRol === 'master') htmlMenu += `<a href="usuarios.html" class="nav-menu__link"><span>🛡️</span> Permisos y Usuarios</a>`;
        
        htmlMenu += `</div></div>`;
    }

    // --- CLIENTES Y AGENDA ---
    if (p.clientes || p.agenda || p.modelos) {
        htmlMenu += `<div class="nav-category"><button class="nav-category-btn">Clientes y Agenda <span class="nav-icon">+</span></button><div class="nav-category-content">`;
        
        if (p.clientes) htmlMenu += `<a href="clientes.html" class="nav-menu__link"><span>👥</span> Clientes</a>`;
        if (p.agenda) htmlMenu += `<a href="agenda.html" class="nav-menu__link"><span>🗓️</span> Agenda</a>`;
        if (p.modelos) htmlMenu += `<a href="modelos.html" class="nav-menu__link"><span>🎨</span> Modelos 3D</a>`;
        
        htmlMenu += `</div></div>`;
    }

    // --- BOTÓN CERRAR SESIÓN ---
    htmlMenu += `
        <div style="padding: 1rem; border-top: 1px solid #e2e8f0; margin-top: 1rem;">
            <button id="btn-cerrar-sesion-menu" class="btn-secondary" style="width: 100%; color: #dc2626; border-color: #fca5a5; background: #fef2f2;">Cerrar Sesión</button>
        </div>
    `;

    navMenu.innerHTML = htmlMenu;

    // ==========================================
    // 4. FUNCIONAMIENTO VISUAL DEL MENÚ
    // ==========================================
    if (menuToggleBtn) {
        const nuevoBoton = menuToggleBtn.cloneNode(true);
        menuToggleBtn.parentNode.replaceChild(nuevoBoton, menuToggleBtn);
        nuevoBoton.addEventListener('click', (e) => { 
            e.preventDefault(); 
            navMenu.classList.toggle('active');
            document.body.classList.toggle('menu-open');
            if (navOverlay) navOverlay.classList.toggle('active');
        });
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
            if (content.style.maxHeight) { 
                content.style.maxHeight = null; 
                icon.textContent = '+'; 
            } else { 
                content.style.maxHeight = content.scrollHeight + "px"; 
                icon.textContent = '-'; 
            }
        });
    });

    // Pinta de rosa la página actual
    const links = document.querySelectorAll('.nav-menu__link');
    links.forEach(link => {
        const href = link.getAttribute('href');
        if (href && archivoActual === href.split('?')[0]) {
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
