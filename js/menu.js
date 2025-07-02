// js/menu.js
document.addEventListener('DOMContentLoaded', () => {
    const menuToggleBtn = document.getElementById('menu-toggle-btn');
    const navMenu = document.getElementById('nav-menu');
    const navOverlay = document.getElementById('nav-overlay');
    const body = document.body;

    const toggleMenu = () => {
        body.classList.toggle('menu-open');
    };

    if (menuToggleBtn && navMenu && navOverlay) {
        menuToggleBtn.addEventListener('click', toggleMenu);
        navOverlay.addEventListener('click', toggleMenu);
    }
});
