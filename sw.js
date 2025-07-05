// sw.js (Versión final con estrategia "Network First")

// Cambiamos la versión una última vez para forzar esta actualización
const CACHE_NAME = 'cotizador-tortas-cache-vFinal'; 

// Lista de archivos esenciales de la "carcasa" de la app
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

// Evento 'install': Se guarda la carcasa básica de la app.
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => {
        console.log('Cache abierto y guardando carcasa de la app');
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

// Evento 'fetch': La nueva estrategia "Network First".
self.addEventListener('fetch', event => {
  event.respondWith(
    // 1. Primero, intenta ir a la red
    fetch(event.request)
      .then(networkResponse => {
        // Si hay respuesta de la red, la guardamos en caché y la devolvemos
        return caches.open(CACHE_NAME).then(cache => {
          cache.put(event.request, networkResponse.clone());
          return networkResponse;
        });
      })
      .catch(() => {
        // 2. Si la red falla (estás offline), busca en el caché
        return caches.match(event.request);
      })
  );
});
