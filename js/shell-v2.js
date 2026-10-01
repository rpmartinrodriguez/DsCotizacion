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

  const permissions = getPermissions();
  const role = localStorage.getItem('userRol') || 'empleado';

  const hasPermission = (permission) => {
    return role === 'master' || permissions.__all === true || permissions[permission] === true;
  };

  const userName = localStorage.getItem('userName');
  const userNameEl = document.getElementById('ds-user-name');
  if (userNameEl && userName) {
    userNameEl.textContent = userName.trim().split(/\s+/)[0] || 'equipo';
  }

  const currentFile = window.location.pathname.split('/').pop() || 'index.html';

  const navIcon = {
    home: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M3 11 12 3l9 8"></path><path d="M5 10v11h14V10"></path></svg>',
    pos: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M4 9h16l-1-5H5L4 9Z"></path><path d="M5 9v11h14V9"></path></svg>',
    agenda: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="3" y="5" width="18" height="16" rx="2"></rect><path d="M16 3v4M8 3v4M3 10h18"></path></svg>',
    stock: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="m12 3 8 4-8 4-8-4 8-4Z"></path><path d="m4 12 8 4 8-4"></path></svg>',
    more: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="5" cy="12" r="1"></circle><circle cx="12" cy="12" r="1"></circle><circle cx="19" cy="12" r="1"></circle></svg>'
  };

  if (document.body.classList.contains('ds-app') && !document.querySelector('.ds-mobile-nav')) {
    const nav = document.createElement('nav');
    nav.className = 'ds-mobile-nav';
    nav.setAttribute('aria-label', 'Navegación principal');

    const items = [
      { href: 'index.html', permission: 'indicadores', label: 'Inicio', icon: navIcon.home },
      { href: 'pos.html', permission: 'mostrador', label: 'Mostrador', icon: navIcon.pos },
      { href: 'agenda.html', permission: 'agenda', label: 'Agenda', icon: navIcon.agenda },
      { href: 'stock.html', permission: 'stock', label: 'Stock', icon: navIcon.stock }
    ];

    items.forEach((item) => {
      if (!hasPermission(item.permission)) return;

      const link = document.createElement('a');
      link.href = item.href;
      link.innerHTML = `${item.icon}<span>${item.label}</span>`;
      if (currentFile === item.href) link.classList.add('active');
      nav.appendChild(link);
    });

    const more = document.createElement('button');
    more.type = 'button';
    more.id = 'mobile-more-btn';
    more.innerHTML = `${navIcon.more}<span>Más</span>`;
    nav.appendChild(more);

    document.body.appendChild(nav);
  }

  document.querySelectorAll('[data-permission]').forEach((item) => {
    const permission = item.dataset.permission;
    if (!hasPermission(permission)) item.style.display = 'none';
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
