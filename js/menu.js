// js/menu.js (Versión mejorada con resaltado de página activa)
document.addEventListener('DOMContentLoaded', () => {
    const menuToggleBtn = document.getElementById('menu-toggle-btn');
    const navMenu = document.getElementById('nav-menu');
    const navOverlay = document.getElementById('nav-overlay');
    const body = document.body;

    // Lógica para abrir y cerrar el menú
    const toggleMenu = () => {
        body.classList.toggle('menu-open');
    };

    if (menuToggleBtn && navMenu && navOverlay) {
        menuToggleBtn.addEventListener('click', toggleMenu);
        navOverlay.addEventListener('click', toggleMenu);
    }

    // --- NUEVA LÓGICA PARA RESALTAR LA PÁGINA ACTIVA ---
    const navLinks = navMenu.querySelectorAll('.nav-menu__link');
    const currentPage = window.location.pathname.split('/').pop(); // Obtiene el nombre del archivo actual (ej: "stock.html")

    navLinks.forEach(link => {
        const linkPage = link.getAttribute('href');
        // Si estamos en la página de inicio (index.html) y el enlace también
        if ((currentPage === '' || currentPage === 'index.html') && (linkPage === 'index.html')) {
            link.classList.add('active');
        } 
        // Si el nombre del archivo del enlace está en la URL actual
        else if (linkPage !== 'index.html' && currentPage === linkPage) {
            link.classList.add('active');
        }
    });
});
