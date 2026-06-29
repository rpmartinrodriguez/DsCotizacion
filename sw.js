const CACHE_NAME = 'dulce-app-dinamico-v1';

// Recursos básicos iniciales (se guardan al instalar, pero luego se actualizan solos)
const ASSETS_TO_CACHE = [
    '/',
    '/index.html',
    '/css/style.css',
    '/assets/logo.png',
    '/assets/apple-touch-icon.png'
];

// ==========================================
// 1. INSTALACIÓN (Forzar actualización)
// ==========================================
self.addEventListener('install', (event) => {
    event.waitUntil(
        caches.open(CACHE_NAME)
        .then((cache) => cache.addAll(ASSETS_TO_CACHE))
        .then(() => {
            // Esto obliga al Service Worker nuevo a instalarse inmediatamente
            // sin esperar a que el usuario cierre la pestaña de la app.
            return self.skipWaiting(); 
        })
    );
});

// ==========================================
// 2. ACTIVACIÓN (Limpieza y toma de control)
// ==========================================
self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys().then((cacheNames) => {
            return Promise.all(
                cacheNames.map((cache) => {
                    // Borramos cachés viejos si alguna vez cambiamos el nombre
                    if (cache !== CACHE_NAME) {
                        return caches.delete(cache);
                    }
                })
            );
        }).then(() => {
            // Esto obliga al Service Worker a tomar el control de la página abierta YA MISMO.
            return self.clients.claim();
        })
    );
});

// ==========================================
// 3. ESTRATEGIA: NETWORK FIRST (Primero la red)
// ==========================================
self.addEventListener('fetch', (event) => {
    // Ignoramos peticiones que no sean GET (como las de Firebase u otras APIs)
    if (event.request.method !== 'GET') return;

    // Ignoramos peticiones a extensiones de Chrome u otros esquemas no HTTP/HTTPS
    if (!event.request.url.startsWith('http')) return;

    event.respondWith(
        fetch(event.request)
            .then((networkResponse) => {
                // Si hay internet y el archivo se descargó bien...
                // Abrimos el caché y guardamos la versión MÁS NUEVA silenciosamente.
                return caches.open(CACHE_NAME).then((cache) => {
                    cache.put(event.request, networkResponse.clone());
                    return networkResponse;
                });
            })
            .catch(() => {
                // Si falla la red (Ej: Estamos sin internet / Modo avión)...
                // Recién acá buscamos el archivo de repuesto que tenemos en el caché.
                return caches.match(event.request);
            })
    );
});
