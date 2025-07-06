// sw.js (Versión final con estrategia "Stale-While-Revalidate")

// Aumentamos la versión para forzar la actualización de este archivo
const CACHE_NAME = 'cotizador-tortas-cache-vFinal-1.0'; 

const APP_SHELL_URLS = [
  '/',
  'index.html',
  'css/style.css',
  'js/menu.js',
  'assets/logo.png',
  'assets/logo-192.png',
  'assets/logo-512.png',
  'https://fonts.googleapis.com/css2?family=Dancing+Script:wght@700&display=swap'
];

// Evento 'install': Guarda la carcasa básica de la app
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(APP_SHELL_URLS))
  );
});

// Evento 'activate': Limpia los cachés antiguos
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames.map(cache => {
          if (cache !== CACHE_NAME) {
            return caches.delete(cache);
          }
        })
      );
    })
  );
});

// Evento 'fetch': La nueva estrategia "Stale-While-Revalidate"
self.addEventListener('fetch', event => {
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

        // Devuelve la versión del caché al instante, o espera a la red si no hay nada en caché
        return cachedResponse || fetchPromise;
      });
    })
  );
});
