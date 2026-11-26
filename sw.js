const CACHE_NAME = 'dulce-sall-admin-v2.50';

const CORE_ASSETS = [
    '/',
    '/index.html',
    '/login.html',
    '/productos.html',
    '/css/style.css',
    '/css/app-v2.css',
    '/js/menu.js',
    '/js/home.js',
    '/js/productos.js',
    '/js/shell-v2.js',
    '/manifest.json',
    '/assets/logo.png',
    '/assets/logo-192.png',
    '/assets/logo-512.png',
    '/assets/apple-touch-icon.png'
];

self.addEventListener('install', (event) => {
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then((cache) => cache.addAll(CORE_ASSETS))
            .then(() => self.skipWaiting())
    );
});

self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys()
            .then((names) => Promise.all(
                names
                    .filter((name) => name !== CACHE_NAME)
                    .map((name) => caches.delete(name))
            ))
            .then(() => self.clients.claim())
    );
});

const isSameOrigin = (request) => {
    try {
        return new URL(request.url).origin === self.location.origin;
    } catch {
        return false;
    }
};

const shouldCacheResponse = (response) => {
    return response && response.ok && response.type === 'basic';
};

self.addEventListener('fetch', (event) => {
    const { request } = event;

    if (request.method !== 'GET' || !isSameOrigin(request)) {
        return;
    }

    // Imágenes, fuentes y estilos muestran el caché de inmediato y se
    // actualizan en segundo plano. JS y páginas siguen siendo network-first
    // para no ejecutar lógica de caja o reglas financieras desactualizadas.
    const pathname = new URL(request.url).pathname;
    if (/\.(?:css|png|jpe?g|webp|svg|ico|woff2?)$/i.test(pathname)) {
        const refresh = fetch(request).then(async response => {
            if (shouldCacheResponse(response)) {
                const copy = response.clone();
                const cache = await caches.open(CACHE_NAME);
                await cache.put(request, copy);
            }
            return response;
        });
        event.waitUntil(refresh.catch(() => {}));
        event.respondWith(
            caches.match(request).then(cached => cached || refresh)
        );
        return;
    }

    if (request.mode === 'navigate') {
        event.respondWith(
            fetch(request)
                .then((response) => {
                    if (shouldCacheResponse(response)) {
                        const copy = response.clone();
                        caches.open(CACHE_NAME).then((cache) => cache.put(request, copy));
                    }
                    return response;
                })
                .catch(async () => {
                    const cachedPage = await caches.match(request);
                    if (cachedPage) return cachedPage;

                    return caches.match('/login.html');
                })
        );
        return;
    }

    event.respondWith(
        fetch(request)
            .then((response) => {
                if (shouldCacheResponse(response)) {
                    const copy = response.clone();
                    caches.open(CACHE_NAME).then((cache) => cache.put(request, copy));
                }
                return response;
            })
            .catch(() => caches.match(request))
    );
});

/* FCM: conservar el service worker PWA y sus políticas de caché. */
self.addEventListener('notificationclick', event => {
    if (!event.notification.data?.dsPush) return;
    event.stopImmediatePropagation();
    event.notification.close();
    const path = ['/pos.html','/stock.html','/index.html'].includes(event.notification.data.path) ? event.notification.data.path : '/index.html';
    event.waitUntil((async () => {
        const windows = await self.clients.matchAll({type:'window', includeUncontrolled:true});
        const client = windows.find(c => c.url === self.location.origin + path);
        if (client) return client.focus();
        return self.clients.openWindow(path);
    })());
});
try {
    importScripts('https://www.gstatic.com/firebasejs/9.15.0/firebase-app-compat.js','https://www.gstatic.com/firebasejs/9.15.0/firebase-messaging-compat.js');
    firebase.initializeApp({
  apiKey: "AIzaSyAI7wOK4t6ZiWbIshuvWANjUfuxboMtK7E",
  authDomain: "dulcesall.firebaseapp.com",
  projectId: "dulcesall",
  storageBucket: "dulcesall.firebasestorage.app",
  messagingSenderId: "758854417192",
  appId: "1:758854417192:web:2ce39292ef724cc20c6e1d"
});
    firebase.messaging().onBackgroundMessage(payload => {
        const d = payload.data || {};
        if (!d.title) return;
        return self.registration.showNotification(d.title,{body:d.body || '',icon:'/assets/logo-192.png',tag:d.eventId || 'dulcesall',data:{dsPush:true,path:d.path || '/index.html'}});
    });
} catch (error) { console.warn('FCM no disponible; la PWA conserva sus funciones.', error); }
