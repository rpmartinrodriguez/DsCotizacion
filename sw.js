// sw.js (Versión final con estrategia "Stale-While-Revalidate")

// Cambiamos la versión una última vez para forzar la instalación de este nuevo Service Worker
const CACHE_NAME = 'cotizador-dulce-app-v2.36'; 

// Archivos esenciales de la "carcasa" de la app que se guardarán al instalar
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

// Evento 'install': Se guarda la carcasa básica de la app en el caché.
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => {
        console.log('Cache abierto y guardando carcasa de la app.');
        return cache.addAll(APP_SHELL_URLS);
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

// Evento 'fetch': Aquí está la nueva estrategia automática.
self.addEventListener('fetch', event => {
  // Ignoramos las peticiones a Firebase para que siempre vayan a la red.
  if (event.request.url.includes('firestore.googleapis.com')) {
    return;
  }

  event.respondWith(
    caches.open(CACHE_NAME).then(cache => {
      return cache.match(event.request).then(cachedResponse => {
        // Hacemos la petición a la red en segundo plano.
        const fetchPromise = fetch(event.request).then(networkResponse => {
          // Si la respuesta es exitosa, actualizamos el caché.
          cache.put(event.request, networkResponse.clone());
          return networkResponse;
        });

        // Devolvemos la respuesta del caché inmediatamente (si existe),
        // o esperamos a la red si es la primera vez que se pide este recurso.
        return cachedResponse || fetchPromise;
      });
    })
  );
});
