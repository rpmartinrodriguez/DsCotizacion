(() => {
  const getPermissions = () => {
    const role = localStorage.getItem('userRol') || 'empleado';
    if (role === 'master') return { __all: true };

    try {
      return JSON.parse(localStorage.getItem('userPermisos') || '{}');
    } catch {
      return {};
    }
  };

  const userName = localStorage.getItem('userName');
  const userNameEl = document.getElementById('ds-user-name');
  if (userNameEl && userName) {
    const firstName = userName.trim().split(/\s+/)[0];
    userNameEl.textContent = firstName || 'equipo';
  }

  const permissions = getPermissions();

  document.querySelectorAll('[data-permission]').forEach((item) => {
    const permission = item.dataset.permission;
    const allowed = permissions.__all === true || permissions[permission] === true;
    if (!allowed) item.style.display = 'none';
  });

  const moreBtn = document.getElementById('mobile-more-btn');
  const navMenu = document.getElementById('nav-menu');
  const overlay = document.getElementById('nav-overlay');

  if (moreBtn && navMenu) {
    moreBtn.addEventListener('click', () => {
      navMenu.classList.add('active');
      document.body.classList.add('menu-open');
      if (overlay) overlay.classList.add('active');
    });
  }
})();
