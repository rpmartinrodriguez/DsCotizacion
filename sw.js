// sw.js (Versión final con lista de caché corregida)

const CACHE_NAME = 'dulce-app-cache-v4.1'; // Nueva versión para forzar la actualización

// Lista de archivos esenciales que SÍ existen en nuestro proyecto.
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
  'js/agenda.js',
  'js/clientes.js',
  'js/compras.js',
  'js/compras-lista.js',
  'js/dashboard.js',
  'js/historial.js',
  'js/presupuesto.js',
  'js/recetas.js',
  'js/stock.js',
  'assets/logo.png',
  'assets/apple-touch-icon.png'
];

// Evento 'install': Se guarda la carcasa básica de la app en el caché.
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => {
        console.log('Cache abierto y guardando carcasa completa de la app.');
        return cache.addAll(APP_SHELL_URLS);
      })
      .catch(error => {
        console.error('Falló el precaching de la App Shell:', error);
      })
  );
});

// Evento 'activate': Se limpian los cachés de versiones antiguas.
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

// Evento 'fetch': Aplica la estrategia "Stale-While-Revalidate".
self.addEventListener('fetch', event => {
  if (event.request.url.includes('firestore.googleapis.com')) {
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
