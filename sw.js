// sw.js (Versión final que ignora peticiones que no son GET)

const CACHE_NAME = 'dulce-app-cache-v4.4'; // Nueva versión para forzar la actualización

// Lista de archivos esenciales de la "carcasa" de la app
const APP_SHELL_URLS = [
  '/',
  'index.html',
  'compras.html',
  'recetas.html',
  'clientes.html',
  'agenda.html',
  'compras-lista.html',
  'presupuesto.html',
  'stock.html',
  'historial.html',
  'css/style.css',
  'js/menu.js',
  'assets/logo.png',
  'assets/apple-touch-icon.png'
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => {
        console.log('Cache abierto y guardando carcasa de la app.');
        return cache.addAll(APP_SHELL_URLS);
      })
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames.map(cacheName => {
          if (cacheName !== CACHE_NAME) {
            console.log('Borrando caché antiguo:', cacheName);
            return caches.delete(cacheName);
          }
        })
      );
    })
  );
});

self.addEventListener('fetch', event => {
  // Ignora las peticiones que no son GET (como las POST a Firebase) y las de extensiones.
  if (event.request.method !== 'GET' || event.request.url.startsWith('chrome-extension://')) {
    return;
  }
    
  event.respondWith(
    caches.open(CACHE_NAME).then(cache => {
      return cache.match(event.request).then(cachedResponse => {
        const fetchPromise = fetch(event.request).then(networkResponse => {
          cache.put(event.request, networkResponse.clone());
          return networkResponse;
        });
        return cachedResponse || fetchPromise;
      });
    })
  );
});
