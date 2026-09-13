document.addEventListener('DOMContentLoaded', () => {
    // ==========================================
    // 1. ABRIR Y CERRAR EL MENÚ LATERAL
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
    // Obtenemos el nombre del archivo actual (ej: "index.html" o "pos.html")
    let currentPath = window.location.pathname.split('/').pop();
    if (currentPath === '') currentPath = 'index.html'; // Por si entra a la raíz

    // Buscamos el link que coincide con la página actual
    const activeLink = document.querySelector(`.nav-menu__link[href="${currentPath}"]`);
    
    if (activeLink) {
        // Pintamos el link de color activo
        activeLink.classList.add('active');
        
        // Buscamos a qué categoría pertenece y la dejamos desplegada
        const parentCategory = activeLink.closest('.nav-category');
        if (parentCategory) {
            parentCategory.classList.add('active');
        }
    }
});
