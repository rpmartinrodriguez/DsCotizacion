async function obtenerSesionAutorizada() {
    try {
        const [
            firebaseAppModule,
            firebaseAuthModule,
            firebaseFirestoreModule
        ] = await Promise.all([
            import("https://www.gstatic.com/firebasejs/9.15.0/firebase-app.js"),
            import("https://www.gstatic.com/firebasejs/9.15.0/firebase-auth.js"),
            import("https://www.gstatic.com/firebasejs/9.15.0/firebase-firestore.js")
        ]);

        const { getApps, getApp } = firebaseAppModule;
        const { getAuth, onAuthStateChanged, signOut } = firebaseAuthModule;
        const { getFirestore, doc, getDoc } = firebaseFirestoreModule;
        let app = getApps().find((candidate) => candidate.name === '[DEFAULT]');

        for (let intento = 0; !app && intento < 120; intento += 1) {
            await new Promise((resolve) => setTimeout(resolve, 25));
            app = getApps().find((candidate) => candidate.name === '[DEFAULT]');
        }

        if (!app) {
            throw new Error('La aplicación principal de Firebase no se inicializó.');
        }

        app = getApp();
        const auth = getAuth(app);
        const db = getFirestore(app);

        const user = await new Promise((resolve) => {
            const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
                unsubscribe();
                resolve(currentUser);
            });
        });

        if (!user || user.isAnonymous) {
            return { autorizado: false, auth, signOut };
        }

        const perfilSnap = await getDoc(doc(db, 'usuarios', user.uid));
        if (!perfilSnap.exists()) {
            return { autorizado: false, auth, signOut };
        }

        const perfil = perfilSnap.data();
        if (perfil.estado !== 'activo') {
            return { autorizado: false, auth, signOut };
        }

        const rol = perfil.rol || 'empleado';
        const permisos = perfil.permisos || {};

        localStorage.setItem('userPermisos', JSON.stringify(permisos));
        localStorage.setItem('userName', perfil.nombre || user.email || 'Usuario');
        localStorage.setItem('userRol', rol);

        return {
            autorizado: true,
            auth,
            signOut,
            rol,
            permisos,
            perfil
        };
    } catch (error) {
        console.error("No se pudo validar la sesión:", error);
        return { autorizado: false };
    }
}

function permisosCompletos() {
    return {
        mostrador: true,
        indicadores: true,
        recetas: true,
        stock: true,
        presupuestos: true,
        precios: true,
        cajas: true,
        finanzas: true,
        historial: true,
        compras: true,
        compras_lista: true,
        clientes: true,
        agenda: true,
        modelos: true,
        configuracion: true
    };
}

const MENU_ICON = {
    menu: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" aria-hidden="true"><path d="M4 6h16M4 12h16M4 18h16"></path></svg>',
    home: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><path d="M3 11 12 3l9 8"></path><path d="M5 10v11h14V10"></path></svg>',
    pos: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><path d="M4 9h16l-1-5H5L4 9Z"></path><path d="M5 9v11h14V9"></path><path d="M9 14h6"></path></svg>',
    stock: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><path d="m12 3 8 4-8 4-8-4 8-4Z"></path><path d="m4 12 8 4 8-4M4 17l8 4 8-4"></path></svg>',
    recipes: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><path d="M6 3h12v18H6z"></path><path d="M9 7h6M9 11h6M9 15h4"></path></svg>',
    quote: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><path d="M6 2h9l4 4v16H6V2Z"></path><path d="M14 2v5h5M9 12h6M9 16h6"></path></svg>',
    prices: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><path d="M20 13 11 22l-9-9V4h9l9 9Z"></path><circle cx="7" cy="9" r="1.5"></circle></svg>',
    clients: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><circle cx="9" cy="8" r="4"></circle><path d="M2.5 21a6.5 6.5 0 0 1 13 0M16 7a3 3 0 1 1 0 6M18 15a5 5 0 0 1 4 5"></path></svg>',
    agenda: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><rect x="3" y="5" width="18" height="16" rx="2"></rect><path d="M16 3v4M8 3v4M3 10h18"></path></svg>',
    models: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><path d="m12 3 8 4.5v9L12 21l-8-4.5v-9L12 3Z"></path><path d="m4 7.5 8 4.5 8-4.5M12 12v9"></path></svg>',
    cash: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><rect x="3" y="6" width="18" height="13" rx="2"></rect><path d="M7 10h10M7 15h4"></path><circle cx="17" cy="15" r="1.5"></circle></svg>',
    finance: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><path d="M4 19V9M10 19V5M16 19v-7M22 19H2"></path></svg>',
    purchase: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><path d="M3 4h2l2 11h10l2-7H7"></path><circle cx="9" cy="19" r="1.5"></circle><circle cx="17" cy="19" r="1.5"></circle><path d="M14 3v6M11 6h6"></path></svg>',
    shoppingList: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><path d="M8 5h13M8 12h13M8 19h13"></path><path d="m3 5 1 1 2-2M3 12l1 1 2-2M3 19l1 1 2-2"></path></svg>',
    history: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><path d="M3 12a9 9 0 1 0 3-6.7L3 8"></path><path d="M3 3v5h5M12 7v5l3 2"></path></svg>',
    users: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><circle cx="8" cy="8" r="3"></circle><circle cx="17" cy="9" r="2.5"></circle><path d="M2.5 20a5.5 5.5 0 0 1 11 0M14 20a4.5 4.5 0 0 1 8 0"></path></svg>',
    logout: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><path d="M10 5H5v14h5M14 8l4 4-4 4M8 12h10"></path></svg>'
};

async function inicializarMenu() {
    const navMenu = document.getElementById('nav-menu');
    const menuToggleBtn = document.getElementById('menu-toggle-btn') || document.getElementById('menu-toggle');
    const navOverlay = document.getElementById('nav-overlay') || document.getElementById('menu-overlay');

    const session = await obtenerSesionAutorizada();

    if (!session.autorizado) {
        localStorage.removeItem('userPermisos');
        localStorage.removeItem('userName');
        localStorage.removeItem('userRol');
        if (!window.location.pathname.endsWith('/login.html')) {
            window.location.replace('login.html');
        }
        return;
    }

    const userRol = session.rol;
    const p = userRol === 'master' ? permisosCompletos() : session.permisos;

    let archivoActual = window.location.pathname.split('/').pop().split('?')[0].split('#')[0];
    if (!archivoActual) archivoActual = 'index.html';

    const accesos = {
        'pos.html': p.mostrador,
        'index.html': p.indicadores,
        'productos.html': p.recetas || p.precios || p.stock,
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

    if (archivoActual !== 'login.html' && Object.prototype.hasOwnProperty.call(accesos, archivoActual) && accesos[archivoActual] !== true) {
        if (p.mostrador) window.location.replace('pos.html');
        else if (p.indicadores) window.location.replace('index.html');
        else if (p.stock) window.location.replace('stock.html');
        else if (p.agenda) window.location.replace('agenda.html');
        else window.location.replace('login.html');
        return;
    }

    if (!navMenu) return;
    const pushModule=userRol==='master'?import('./core/push-client.js?v=6').then(mod=>{mod.mountPushControls(session.auth);return mod;}).catch(error=>{console.warn('No se pudieron preparar las notificaciones',error);return null;}):null;

    const nombre = session.perfil?.nombre || 'Dulce Sall';

    let htmlMenu = '';
    const categoryIcons={'Operación':'pos','Productos':'recipes','Insumos y compras':'stock','Clientes y pedidos':'clients','Administración':'finance','Herramientas':'models'};
    const categoriaMenu=(titulo,ayuda)=>`<div class="nav-category"><button type="button" class="nav-category-btn" aria-expanded="false" title="${ayuda}"><span class="ds-topnav-icon">${MENU_ICON[categoryIcons[titulo]]}</span><span class="ds-topnav-name">${titulo}</span><span class="ds-topnav-chevron" aria-hidden="true">⌄</span></button><div class="nav-category-content" hidden><p class="ds-topnav-help">${ayuda}</p>`;
    if (p.mostrador || p.indicadores) {
        htmlMenu += categoriaMenu('Operación', 'Trabajo diario: inicio de jornada y ventas de mostrador.');
        if (p.indicadores) htmlMenu += `<a href="index.html" class="nav-menu__link" title="Inicio"><span class="nav-menu__glyph">${MENU_ICON.home}</span><span class="nav-menu__label">Inicio</span></a>`;
        if (p.mostrador) htmlMenu += `<a href="pos.html" class="nav-menu__link" title="Mostrador"><span class="nav-menu__glyph">${MENU_ICON.pos}</span><span class="nav-menu__label">Mostrador</span></a>`;
        htmlMenu += `</div></div>`;
    }

    if (p.recetas || p.precios || p.stock) {
        htmlMenu += categoriaMenu('Productos', 'Una misma elaboración vista desde receta, costo, precio de venta y seguimiento.');
        if (p.recetas || p.precios || p.stock) htmlMenu += `<a href="productos.html" class="nav-menu__link" title="Maestro de Productos"><span class="nav-menu__glyph">${MENU_ICON.recipes}</span><span class="nav-menu__label">Maestro de Productos</span></a>`;
        if (p.recetas) htmlMenu += `<a href="recetas.html" class="nav-menu__link" title="Recetas y costos"><span class="nav-menu__glyph">${MENU_ICON.recipes}</span><span class="nav-menu__label">Recetas y costos</span></a>`;
        if (p.precios) htmlMenu += `<a href="precios.html" class="nav-menu__link" title="Precios y revisión"><span class="nav-menu__glyph">${MENU_ICON.prices}</span><span class="nav-menu__label">Precios y revisión</span></a>`;
        htmlMenu += `</div></div>`;
    }

    if (p.stock || p.compras || p.compras_lista) {
        htmlMenu += categoriaMenu('Insumos y compras', 'Materias primas, proveedores, reposición y registro de compras.');
        if (p.stock) htmlMenu += `<a href="stock.html" class="nav-menu__link" title="Stock de materias primas"><span class="nav-menu__glyph">${MENU_ICON.stock}</span><span class="nav-menu__label">Stock e insumos</span></a>`;
        if (p.compras) htmlMenu += `<a href="compras.html" class="nav-menu__link" title="Registrar compra"><span class="nav-menu__glyph">${MENU_ICON.purchase}</span><span class="nav-menu__label">Registrar compra</span></a>`;
        if (p.compras_lista) htmlMenu += `<a href="compras-lista.html" class="nav-menu__link" title="Lista de compras"><span class="nav-menu__glyph">${MENU_ICON.shoppingList}</span><span class="nav-menu__label">Lista de compras</span></a>`;
        htmlMenu += `</div></div>`;
    }

    if (p.clientes || p.agenda || p.presupuestos) {
        htmlMenu += categoriaMenu('Clientes y pedidos', 'Clientes, compromisos de entrega y presupuestos.');
        if (p.clientes) htmlMenu += `<a href="clientes.html" class="nav-menu__link" title="Clientes"><span class="nav-menu__glyph">${MENU_ICON.clients}</span><span class="nav-menu__label">Clientes</span></a>`;
        if (p.agenda) htmlMenu += `<a href="agenda.html" class="nav-menu__link" title="Agenda y entregas"><span class="nav-menu__glyph">${MENU_ICON.agenda}</span><span class="nav-menu__label">Agenda y entregas</span></a>`;
        if (p.presupuestos) htmlMenu += `<a href="presupuesto.html" class="nav-menu__link" title="Presupuestos"><span class="nav-menu__glyph">${MENU_ICON.quote}</span><span class="nav-menu__label">Presupuestos</span></a>`;
        htmlMenu += `</div></div>`;
    }

    if (p.cajas || p.finanzas || p.historial || p.configuracion || userRol === 'master') {
        htmlMenu += categoriaMenu('Administración', 'Control de caja, resultados, auditoría y permisos.');
        if (p.cajas) htmlMenu += `<a href="cajas.html" class="nav-menu__link" title="Cajas"><span class="nav-menu__glyph">${MENU_ICON.cash}</span><span class="nav-menu__label">Cajas</span></a>`;
        if (p.finanzas) htmlMenu += `<a href="finanzas.html" class="nav-menu__link" title="Finanzas"><span class="nav-menu__glyph">${MENU_ICON.finance}</span><span class="nav-menu__label">Finanzas</span></a>`;
        if (p.historial) htmlMenu += `<a href="historial.html" class="nav-menu__link" title="Historial"><span class="nav-menu__glyph">${MENU_ICON.history}</span><span class="nav-menu__label">Historial</span></a>`;
        if (p.configuracion || userRol === 'master') htmlMenu += `<a href="usuarios.html" class="nav-menu__link" title="Usuarios y permisos"><span class="nav-menu__glyph">${MENU_ICON.users}</span><span class="nav-menu__label">Usuarios y permisos</span></a>`;
        htmlMenu += `</div></div>`;
    }

    if (p.modelos) {
        htmlMenu += categoriaMenu('Herramientas', 'Funciones de apoyo que no forman parte del circuito diario principal.');
        htmlMenu += `<a href="modelos.html" class="nav-menu__link" title="Modelos 3D"><span class="nav-menu__glyph">${MENU_ICON.models}</span><span class="nav-menu__label">Modelos 3D</span></a>`;
        htmlMenu += `</div></div>`;
    }

    htmlMenu += `
        <div class="nav-menu__footer">
            <button id="btn-cerrar-sesion-menu" class="btn-secondary nav-menu__logout" title="Cerrar sesión">
                <span class="nav-menu__logout-icon">${MENU_ICON.logout}</span>
                <span class="nav-menu__logout-label">Cerrar sesión</span>
            </button>
        </div>
    `;

    navMenu.innerHTML = htmlMenu;

    const header=document.querySelector('.header');
    if(!header)return;
    document.body.classList.remove('ds-sidebar-collapsed','menu-open');
    document.body.classList.add('ds-topnav-layout');
    navMenu.setAttribute('aria-label','Navegación por categorías');
    navMenu.classList.add('ds-topnav');
    if(navMenu.parentElement!==header)header.querySelector('.header__logo-link')?.after(navMenu);
    if(navMenu.parentElement!==header)header.append(navMenu);
    if(menuToggleBtn)menuToggleBtn.hidden=true;
    if(navOverlay){navOverlay.classList.remove('active');navOverlay.hidden=true;}
    const groups=[...navMenu.querySelectorAll('.nav-category')];
    let current=null;
    const closeMenu=(restoreFocus=false)=>{
        if(!current)return;
        const {button,panel}=current;
        panel.hidden=true;button.setAttribute('aria-expanded','false');current=null;
        if(restoreFocus)button.focus();
    };
    const positionPanel=()=>{
        if(!current)return;
        const {button,panel}=current,rect=button.getBoundingClientRect(),width=Math.min(270,window.innerWidth-20),top=Math.ceil(header.getBoundingClientRect().bottom)+5;
        panel.style.width=width+'px';panel.style.top=top+'px';
        panel.style.left=Math.max(10,Math.min(rect.left,window.innerWidth-width-10))+'px';
        panel.style.maxHeight=Math.max(100,window.innerHeight-top-10)+'px';
    };
    groups.forEach((group,i)=>{
        const button=group.querySelector('.nav-category-btn'),panel=group.querySelector('.nav-category-content');
        panel.id='ds-topnav-panel-'+i;panel.classList.add('ds-topnav-panel');button.setAttribute('aria-controls',panel.id);
        document.body.append(panel);
        panel.querySelectorAll('.nav-menu__link').forEach(link=>{
            if(archivoActual===link.getAttribute('href')?.split('?')[0]){link.classList.add('active');link.setAttribute('aria-current','page');button.classList.add('is-current');}
            link.addEventListener('click',()=>closeMenu());
        });
        button.addEventListener('click',()=>{if(current?.button===button){closeMenu();return;}closeMenu();current={button,panel};button.setAttribute('aria-expanded','true');panel.hidden=false;positionPanel();});
        button.addEventListener('keydown',event=>{
            if(event.key==='ArrowDown'){event.preventDefault();if(current?.button!==button)button.click();panel.querySelector('a')?.focus();}
            if(event.key==='ArrowLeft'||event.key==='ArrowRight'){event.preventDefault();groups[(i+(event.key==='ArrowRight'?1:-1)+groups.length)%groups.length].querySelector('button')?.focus();}
        });
    });
    const logout=navMenu.querySelector('#btn-cerrar-sesion-menu');
    if(logout){logout.classList.add('ds-topnav-logout');logout.title='Cerrar sesión · '+nombre;}
    document.addEventListener('pointerdown',event=>{if(current&&!current.button.contains(event.target)&&!current.panel.contains(event.target))closeMenu();});
    document.addEventListener('keydown',event=>{if(event.key==='Escape'&&current){event.preventDefault();closeMenu(true);}});
    window.addEventListener('resize',()=>closeMenu());navMenu.addEventListener('scroll',()=>closeMenu(),{passive:true});window.addEventListener('pageshow',()=>closeMenu());

    // Accesos adicionales, sin alterar los permisos ni las rutas originales.
    if(p.cajas){
        const financePanel=[...document.querySelectorAll('.ds-topnav-panel')].find(panel=>panel.querySelector('a[href="cajas.html"]'));
        if(financePanel){const link=document.createElement('a');link.href='cajas.html#decisiones';link.className='nav-menu__link';link.innerHTML='<span class="nav-menu__glyph">'+MENU_ICON.finance+'</span><span class="nav-menu__label">Dulce Sall Intelligence</span>';financePanel.append(link);}
    }
    if(userRol==='master'){
        const panel=[...document.querySelectorAll('.ds-topnav-panel')].find(node=>node.querySelector('a[href="usuarios.html"]'));
        if(panel){
            const action=document.createElement('button');
            action.type='button';action.className='ds-tools-menu-action';action.textContent='Notificaciones push';
            action.addEventListener('click',async()=>{
                closeMenu();
                let mod=await pushModule;
                if(!mod){try{mod=await import('./core/push-client.js?v=6');mod.mountPushControls(session.auth);}catch(error){alert('No se pudo abrir la configuración de push. Revisá la conexión.');return;}}
                window.dispatchEvent(new Event('ds-open-push-settings'));
            });
            panel.append(action);
        }
    }
    import('./core/admin-tools.js?v=3').then(m=>m.mountAdminTools({session,p,header,navMenu})).catch(console.warn);

    // Anticipar el HTML de la sección que el usuario está por abrir.
    // No ejecuta scripts ni consulta datos de Firebase; sólo precarga HTML.
    const rutasPrecargadas = new Set();
    const ahorroDeDatos = navigator.connection?.saveData === true;
    const progreso = document.createElement('div');
    progreso.setAttribute('aria-hidden', 'true');
    progreso.style.cssText = 'position:fixed;top:0;left:0;height:3px;width:0;background:#be477a;z-index:99999;pointer-events:none;transition:width .18s ease;opacity:0;';
    document.body.appendChild(progreso);

    document.querySelectorAll('.nav-menu__link').forEach(link => {
        const destino = new URL(link.href, window.location.href);
        if (destino.origin !== window.location.origin) return;

        const precargar = () => {
            if (ahorroDeDatos || rutasPrecargadas.has(destino.pathname)
                || destino.pathname === window.location.pathname) return;
            rutasPrecargadas.add(destino.pathname);
            const recurso = document.createElement('link');
            recurso.rel = 'prefetch';
            recurso.href = destino.pathname;
            document.head.appendChild(recurso);
        };
        link.addEventListener('pointerenter', precargar, { once: true });
        link.addEventListener('focus', precargar, { once: true });
        link.addEventListener('click', event => {
            if (event.defaultPrevented || event.button !== 0
                || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey
                || destino.pathname === window.location.pathname) return;
            // Respuesta visual inmediata, sin demorar ni interceptar navegación.
            progreso.style.opacity = '1';
            progreso.style.width = '65%';
        });
    });
    window.addEventListener('pageshow', () => {
        progreso.style.opacity = '0';
        progreso.style.width = '0';
    });

    const btnCerrarSesion = document.getElementById('btn-cerrar-sesion-menu');
    if (btnCerrarSesion) {
        btnCerrarSesion.addEventListener('click', async () => {
            btnCerrarSesion.disabled = true;
            btnCerrarSesion.innerHTML = `<span class="nav-menu__logout-icon">${MENU_ICON.logout}</span><span class="nav-menu__logout-label">Cerrando…</span>`;

            try {
                if (session.auth && session.signOut) {
                    if (userRol === 'master') {
                        try { await (await import('./core/push-client.js?v=6')).disablePush(session.auth); } catch (error) { console.warn('No se pudo desactivar push al salir', error); }
                    }
                    await session.signOut(session.auth);
                }
            } catch (error) {
                console.error("Error al cerrar sesión:", error);
            } finally {
                // Mantener preferencias y borradores locales, aislados por UID y caja.
                const preserved=[];
                try{for(let i=0;i<localStorage.length;i++){const k=localStorage.key(i);if(/^(ds-favorite-pages:|ds-pos-category:|ds-pos-parked:)/.test(k||''))preserved.push([k,localStorage.getItem(k)]);}}catch{}
                localStorage.clear();
                for(const [k,v] of preserved)try{localStorage.setItem(k,v);}catch{}
                window.location.replace('login.html');
            }
        });
    }
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', inicializarMenu);
} else {
    inicializarMenu();
}
