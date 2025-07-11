// sw.js (Versión final con estrategia "Stale-While-Revalidate" y caché de la App Shell)

const CACHE_NAME = 'dulce-app-cache-v4.0'; // Nueva versión final

// Lista de archivos esenciales para que la aplicación se inicie.
const APP_SHELL_URLS = [
  '/',
  'index.html',
  'css/style.css',
  'js/menu.js',
  'assets/logo.png',
  'assets/apple-touch-icon.png',
  'https://fonts.googleapis.com/css2?family=Dancing+Script:wght@700&display=swap'
];

// Evento 'install': Guarda la carcasa básica de la app en el caché.
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => {
        console.log('Cache abierto y guardando carcasa de la app.');
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

// Evento 'fetch': Aplica la estrategia "Stale-While-Revalidate".
self.addEventListener('fetch', event => {
  // No aplicamos la estrategia a las peticiones de Firebase para que siempre vayan a la red.
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
