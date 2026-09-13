// ==========================================
// CAMBIAR ESTE NÚMERO CADA VEZ QUE HAGAS UNA ACTUALIZACIÓN GRANDE
// ==========================================
const CACHE_NAME = 'dulce-app-dinamico-v2.0'; 

// Recursos básicos iniciales
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
        .then((cache) => {
            console.log('[Service Worker] Instalando nueva versión:', CACHE_NAME);
            return cache.addAll(ASSETS_TO_CACHE);
        })
        .then(() => {
            // Obliga al Service Worker nuevo a instalarse inmediatamente
            return self.skipWaiting(); 
        })
    );
});

// ==========================================
// 2. ACTIVACIÓN (Limpieza DESTRUCTIVA del caché viejo)
// ==========================================
self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys().then((cacheNames) => {
            return Promise.all(
                cacheNames.map((cache) => {
                    // Si el nombre del caché no coincide con nuestra versión actual (v2.0)... ¡Lo borramos!
                    if (cache !== CACHE_NAME) {
                        console.log('[Service Worker] Borrando caché viejo:', cache);
                        return caches.delete(cache);
                    }
                })
            );
        }).then(() => {
            console.log('[Service Worker] Tomando el control de la app');
            // Obliga al Service Worker a tomar el control YA MISMO.
            return self.clients.claim();
        })
    );
});

// ==========================================
// 3. ESTRATEGIA: NETWORK FIRST (Siempre trae lo más nuevo si hay internet)
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
                // Buscamos el archivo de repuesto que tenemos en el caché.
                return caches.match(event.request);
            })
    );
});
