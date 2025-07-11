// sw.js (Versión final con estrategia "Stale-While-Revalidate" y caché completo)

const CACHE_NAME = 'dulce-app-cache-v3.0'; // Nueva versión final

// Lista COMPLETA de archivos esenciales para que toda la aplicación funcione sin conexión.
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

// Evento 'install': Guarda la carcasa básica de la app en el caché.
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => {
        console.log('Cache abierto y guardando carcasa completa de la app.');
        return cache.addAll(APP_SHELL_URLS);
      })
  );
});

// Evento 'activate': Limpia los cachés de versiones antiguas.
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

// Evento 'fetch': Estrategia "Stale-While-Revalidate".
self.addEventListener('fetch', event => {
  // Ignoramos las peticiones a Firebase para que siempre vayan a la red.
  if (event.request.url.includes('firestore.googleapis.com')) {
    return;
  }
    
  event.respondWith(
    caches.open(CACHE_NAME).then(cache => {
      // 1. Responde inmediatamente con el caché si está disponible
      return cache.match(event.request).then(cachedResponse => {
        // 2. Mientras tanto, busca una versión nueva en la red
        const fetchPromise = fetch(event.request).then(networkResponse => {
          // Si la obtiene, la guarda en el caché para la próxima vez
          cache.put(event.request, networkResponse.clone());
          return networkResponse;
        });

        // Devuelve la versión del caché al instante, o espera a la red si es la primera vez
        return cachedResponse || fetchPromise;
      });
    })
  );
});
