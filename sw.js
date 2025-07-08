// sw.js (Versión final con apple-touch-icon y estrategia "Stale-While-Revalidate")

// Aumentamos la versión para forzar la actualización de este archivo
const CACHE_NAME = 'cotizador-tortas-cache-vFinal-1.2'; 

const APP_SHELL_URLS = [
  '/',
  'index.html',
  'css/style.css',
  'js/menu.js',
  'assets/logo.png',
  'assets/logo-192.png',
  'assets/logo-512.png',
  'assets/apple-touch-icon.png', // <-- AÑADIDO EL ÍCONO DE APPLE
  'https://fonts.googleapis.com/css2?family=Dancing+Script:wght@700&display=swap'
];

// Evento 'install': Se dispara cuando el Service Worker se instala por primera vez.
self.addEventListener('install', event => {
  // Esperamos a que la promesa de abrir el caché y añadir los archivos se complete.
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => {
        console.log('Cache abierto y guardando archivos de la nueva versión.');
        return cache.addAll(APP_SHELL_URLS);
      })
  );
});

// Evento 'activate': Se limpian los cachés antiguos.
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames.map(cache => {
          if (cache !== CACHE_NAME) {
            console.log('Borrando caché antiguo:', cache);
            return caches.delete(cache);
          }
        })
      );
    })
  );
});

// Evento 'fetch': Estrategia "Stale-While-Revalidate".
self.addEventListener('fetch', event => {
  // No aplicamos la estrategia a las peticiones de Firebase
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
        }).catch(err => {
            // Si la red falla, no hacemos nada, ya hemos servido desde el caché si existía
            console.warn('Petición de red fallida:', err);
        });

        // Devuelve la versión del caché al instante, o espera a la red si no hay nada en caché
        return cachedResponse || fetchPromise;
      });
    })
  );
});
