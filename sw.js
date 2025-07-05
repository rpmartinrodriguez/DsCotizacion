// sw.js - Service Worker Básico para Cache

const CACHE_NAME = 'cotizador-tortas-cache-v1';
// Lista de archivos esenciales para que la carcasa de la aplicación funcione sin conexión.
const urlsToCache = [
  '/',
  'index.html',
  'css/style.css',
  'js/menu.js',
  'assets/logo.png',
  'assets/logo-192.png',
  'assets/logo-512.png'
];

// Evento 'install': Se dispara cuando el Service Worker se instala por primera vez.
// Aquí es donde guardamos los archivos básicos en el caché.
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => {
        console.log('Cache abierto y listo para guardar archivos.');
        return cache.addAll(urlsToCache);
      })
  );
});

// Evento 'fetch': Se dispara cada vez que la página pide un recurso (una imagen, un css, etc.)
self.addEventListener('fetch', event => {
  event.respondWith(
    // Buscamos si el recurso solicitado ya está en nuestro caché.
    caches.match(event.request)
      .then(response => {
        // Si el recurso está en el caché, lo devolvemos desde ahí.
        // ¡Esto es lo que hace que funcione offline!
        if (response) {
          return response;
        }
        // Si no está en el caché, lo pedimos a la red como se haría normalmente.
        return fetch(event.request);
      })
  );
});
