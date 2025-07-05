// sw.js - Service Worker Mejorado con versionado y limpieza

const CACHE_NAME = 'cotizador-tortas-cache-v5'; // <--- Cambiamos la versión aquí
// Lista de archivos esenciales para que la aplicación funcione sin conexión.
const urlsToCache = [
  '/',
  'index.html',
  'css/style.css',
  'js/menu.js',
  'assets/logo.png',
  'assets/logo-192.png',
  'assets/logo-512.png'
];

// Evento 'install': Guarda los archivos básicos en el caché.
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => {
        console.log('Cache abierto y guardando archivos de la nueva versión.');
        return cache.addAll(urlsToCache);
      })
  );
});

// Evento 'activate': Se dispara cuando el nuevo Service Worker se activa.
// Aquí es donde limpiamos los cachés viejos.
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

// Evento 'fetch': Intercepta las peticiones de la app.
self.addEventListener('fetch', event => {
  event.respondWith(
    caches.match(event.request)
      .then(response => {
        // Si el recurso está en el caché, lo devuelve. Si no, lo busca en la red.
        return response || fetch(event.request);
      })
  );
});
